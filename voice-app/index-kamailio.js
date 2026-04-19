/**
 * Voice Interface Application - Kamailio Edition
 * Main entry point using Kamailio + FreeSWITCH ESL
 * (Alternative to index.js which uses drachtio)
 */

require("dotenv").config();

// Import ESL client
const { ESLConnection } = require("./lib/freeswitch-esl");

// Import application modules
var httpServerModule = require("./lib/http-server");
var createHttpServer = httpServerModule.createHttpServer;
var cleanupOldFiles = httpServerModule.cleanupOldFiles;
var AudioForkServer = require("./lib/audio-fork").AudioForkServer;
var whisperClient = require("./lib/whisper-client");
var claudeBridge = require("./lib/claude-bridge");
var ttsService = require("./lib/tts-service");
var deviceRegistry = require("./lib/device-registry");
var { runConversationLoopESL } = require("./lib/conversation-loop-esl");

// Import outbound calling
var outboundModule = require("./lib/outbound-routes");
var outboundRouter = outboundModule.router;
var setupOutboundRoutes = outboundModule.setupRoutes;

// Import query routes
var queryModule = require("./lib/query-routes");
var queryRouter = queryModule.router;
var setupQueryRoutes = queryModule.setupRoutes;

// Configuration
var config = {
  freeswitch: {
    host: process.env.FREESWITCH_HOST || "127.0.0.1",
    port: parseInt(process.env.FREESWITCH_PORT) || 8021,
    secret: process.env.FREESWITCH_SECRET || "JambonzR0ck$"
  },
  sip: {
    domain: process.env.SIP_DOMAIN || "hello.networkchuck.com",
    registrar: process.env.SIP_REGISTRAR || "hello.networkchuck.com",
    registrar_port: parseInt(process.env.SIP_REGISTRAR_PORT) || 5060
  },
  external_ip: process.env.EXTERNAL_IP || "10.70.7.81",
  http_port: parseInt(process.env.HTTP_PORT) || 3000,
  ws_port: parseInt(process.env.WS_PORT) || 3001,
  audio_dir: process.env.AUDIO_DIR || "/tmp/voice-audio"
};

// Global state
var eslConnection = null;
var httpServer = null;
var audioForkServer = null;
var isReady = false;

// Log startup
console.log("\n" + "=".repeat(64));
console.log("          Voice Interface Application Starting                 ");
console.log("       (Kamailio + FreeSWITCH ESL Edition)                     ");
console.log("=".repeat(64));
console.log("\nConfiguration:");
console.log("  - FreeSWITCH:  " + config.freeswitch.host + ":" + config.freeswitch.port);
console.log("  - SIP Domain:  " + config.sip.domain);
console.log("  - Registrar:   " + config.sip.registrar + ":" + config.sip.registrar_port);
console.log("  - External IP: " + config.external_ip);
console.log("  - HTTP Port:   " + config.http_port);
console.log("  - WS Port:     " + config.ws_port);
console.log("  - Audio Dir:   " + config.audio_dir);
console.log("  - Mix Type:    " + (process.env.AUDIO_FORK_MIXTYPE || "L") + " (capture direction)");
console.log("\n[DEVICES] Loaded " + Object.keys(deviceRegistry.getAllDevices()).length + " device extensions");
console.log("\nWaiting for connections...\n");

/**
 * Initialize HTTP server and WebSocket
 */
function initializeServers() {
  var fs = require("fs");
  if (!fs.existsSync(config.audio_dir)) {
    fs.mkdirSync(config.audio_dir, { recursive: true });
  }

  // HTTP server for TTS audio
  httpServer = createHttpServer(config.audio_dir, config.http_port);
  console.log("[" + new Date().toISOString() + "] HTTP Server started on port " + config.http_port);

  // Setup Kamailio event handler
  setupKamailioEventHandler();

  // WebSocket server for audio fork
  audioForkServer = new AudioForkServer({ port: config.ws_port });
  audioForkServer.start();
  audioForkServer.on("listening", function() {
    console.log("[" + new Date().toISOString() + "] WEBSOCKET Audio fork server started on port " + config.ws_port);
  });
  audioForkServer.on("session", function(session) {
    console.log("[AUDIO] New session for call " + session.callUuid);
  });

  // TTS service
  ttsService.setAudioDir(config.audio_dir);
  console.log("[" + new Date().toISOString() + "] TTS Service configured");

  // ========== OUTBOUND CALLING ROUTES ==========
  setupOutboundRoutes({
    eslConnection: eslConnection,
    deviceRegistry: deviceRegistry,
    audioForkServer: audioForkServer,
    whisperClient: whisperClient,
    claudeBridge: claudeBridge,
    ttsService: ttsService,
    wsPort: config.ws_port
  });

  httpServer.app.use("/api", outboundRouter);
  console.log("[" + new Date().toISOString() + "] OUTBOUND Calling API enabled");

  // ========== QUERY API ROUTES ==========
  setupQueryRoutes({
    claudeBridge: claudeBridge
  });

  httpServer.app.use("/api", queryRouter);
  console.log("[" + new Date().toISOString() + "] QUERY API enabled (/api/query, /api/devices)");

  // Finalize HTTP server
  httpServer.finalize();

  // Cleanup old files periodically
  setInterval(function() {
    cleanupOldFiles(config.audio_dir, 5 * 60 * 1000);
  }, 60 * 1000);
}

/**
 * Handle Kamailio events via HTTP
 */
function setupKamailioEventHandler() {
  var express = require('express');

  // Event endpoint for Kamailio
  httpServer.app.post("/sip/event", express.json(), function(req, res) {
    var event = req.body;

    console.log("[" + new Date().toISOString() + "] KAMAILIO Event: " + event.event);

    switch (event.event) {
      case "invite":
        handleKamailioInvite(event, res);
        break;
      case "bye":
        handleKamailioBye(event);
        res.json({ ok: true });
        break;
      case "register":
        console.log("[" + new Date().toISOString() + "] REGISTER: " + event.extension);
        res.json({ ok: true });
        break;
      case "failure":
        console.log("[" + new Date().toISOString() + "] CALL FAILED: " + event.callId);
        res.json({ ok: true });
        break;
      default:
        res.json({ ok: true });
    }
  });

  console.log("[" + new Date().toISOString() + "] Kamailio event handler registered");
}

/**
 * Handle INVITE from Kamailio
 */
async function handleKamailioInvite(event, res) {
  const { callId, from, to, extension } = event;

  console.log("[" + new Date().toISOString() + "] INVITE: " + from + " -> " + extension);

  // Get device config
  const deviceConfig = deviceRegistry.getDeviceByExtension(extension);

  // Wait for FreeSWITCH to create the channel
  // In a real implementation, we'd need to correlate the SIP Call-ID with FreeSWITCH UUID
  // For now, we acknowledge to Kamailio and handle the call via ESL events

  res.json({ ok: true, message: "Accepted" });

  // Start monitoring for this call via ESL
  // The call will be picked up by ESL channel_create event
}

/**
 * Handle BYE from Kamailio
 */
function handleKamailioBye(event) {
  const { callId, from, to } = event;
  console.log("[" + new Date().toISOString() + "] BYE: " + callId);

  // Find and terminate the call
  const call = eslConnection.getCall(callId);
  if (call) {
    call.hangup();
  }
}

/**
 * Setup ESL call handlers
 */
function setupESLHandlers() {
  // Subscribe to events we care about
  eslConnection.subscribe([
    'CHANNEL_CREATE',
    'CHANNEL_DESTROY',
    'CHANNEL_ANSWER',
    'CHANNEL_HANGUP_COMPLETE',
    'DTMF',
    'RECORD_START',
    'RECORD_STOP'
  ]);

  // Handle new calls
  eslConnection.on('call::create', function(call) {
    console.log("[" + new Date().toISOString() + "] CALL Created: " + call.uuid);

    // Answer the call
    call.answer().then(() => {
      console.log("[" + new Date().toISOString() + "] CALL Answered: " + call.uuid);

      // Start conversation
      handleCall(call);
    }).catch(err => {
      console.error("[" + new Date().toISOString() + "] CALL Answer failed: " + err.message);
    });
  });

  // Handle call destruction
  eslConnection.on('call::destroy', function(call) {
    console.log("[" + new Date().toISOString() + "] CALL Ended: " + call.uuid);
  });
}

/**
 * Handle a call with conversation loop using ESL
 */
async function handleCall(call) {
  // Get extension from call variables (would need to be set by dialplan)
  // For now, use a default
  const extension = "9000";
  const deviceConfig = deviceRegistry.getDeviceByExtension(extension);

  console.log("[" + new Date().toISOString() + "] CONVERSATION Starting for " + call.uuid);

  // Run the conversation loop
  await runConversationLoopESL(call, audioForkServer, {
    whisperClient,
    claudeBridge,
    ttsService,
    wsPort: config.ws_port,
    deviceConfig,
    maxTurns: 20
  });
}

/**
 * Main initialization
 */
async function main() {
  // Connect to FreeSWITCH ESL
  eslConnection = new ESLConnection({
    host: config.freeswitch.host,
    port: config.freeswitch.port,
    password: config.freeswitch.secret
  });

  try {
    await eslConnection.connect();
    isReady = true;

    console.log("[" + new Date().toISOString() + "] FREESWITCH ESL Connected");
    console.log("\n[" + new Date().toISOString() + "] READY Voice interface is fully connected!");
    console.log("=".repeat(64) + "\n");

    // Setup handlers
    setupESLHandlers();

    // Start HTTP server
    initializeServers();

  } catch (err) {
    console.error("[" + new Date().toISOString() + "] FREESWITCH Connection failed: " + err.message);
    console.error("[" + new Date().toISOString() + "] Please check:");
    console.error("  1. FreeSWITCH is running");
    console.error("  2. ESL port " + config.freeswitch.port + " is accessible");
    process.exit(1);
  }
}

// Graceful shutdown
function shutdown(signal) {
  console.log("\n[" + new Date().toISOString() + "] Received " + signal + ", shutting down...");
  if (eslConnection) eslConnection.disconnect();
  if (httpServer) httpServer.close();
  if (audioForkServer) audioForkServer.stop();
  setTimeout(function() { process.exit(0); }, 1000);
}

process.on("SIGTERM", function() { shutdown("SIGTERM"); });
process.on("SIGINT", function() { shutdown("SIGINT"); });

// Start
main();
