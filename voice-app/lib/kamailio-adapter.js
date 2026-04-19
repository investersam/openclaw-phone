/**
 * Kamailio HTTP Adapter
 * Replaces drachtio-srf for SIP integration
 * Receives SIP events from Kamailio via HTTP callbacks
 */

const express = require('express');
const EventEmitter = require('events');
const crypto = require('crypto');

class KamailioAdapter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 5070;
    this.httpPort = options.httpPort || 3000;
    this.app = express();
    this.calls = new Map();
    this.registrations = new Map();

    this.setupRoutes();
  }

  /**
   * Set up HTTP routes for Kamailio callbacks
   */
  setupRoutes() {
    this.app.use(express.json());

    // INVITE handler - Kamailio forwards incoming calls here
    this.app.post('/sip/invite', (req, res) => {
      const { callId, from, to, extension } = req.body;

      console.log(`[KAMAILIO-ADAPTER] INVITE received: ${callId} from ${from} to ${extension}`);

      // Create call context
      const callContext = {
        callId,
        from,
        to,
        extension,
        startTime: Date.now(),
        dialog: new EventEmitter()
      };

      this.calls.set(callId, callContext);

      // Emit invite event for handlers
      this.emit('invite', {
        callId,
        from,
        to,
        extension,
        respond: (status, body) => {
          if (status === 200) {
            res.json({ accepted: true, sdp: body });
          } else {
            res.status(503).json({ accepted: false, error: body });
          }
        }
      });

      // Timeout if no handler responds
      setTimeout(() => {
        if (!res.headersSent) {
          res.status(503).json({ accepted: false, error: 'No handler' });
        }
      }, 5000);
    });

    // BYE handler - call ended
    this.app.post('/sip/bye', (req, res) => {
      const { callId, from, to, event } = req.body;

      console.log(`[KAMAILIO-ADAPTER] BYE received: ${callId}`);

      const call = this.calls.get(callId);
      if (call) {
        call.dialog.emit('bye', { callId, from, to });
        this.emit('callEnded', { callId, from, to, duration: Date.now() - call.startTime });
        this.calls.delete(callId);
      }

      res.json({ ok: true });
    });

    // REGISTER handler - extension registration
    this.app.post('/sip/register', (req, res) => {
      const { extension, contact, event } = req.body;

      console.log(`[KAMAILIO-ADAPTER] REGISTER: ${extension} at ${contact}`);

      this.registrations.set(extension, {
        contact,
        registeredAt: Date.now()
      });

      this.emit('register', { extension, contact });
      res.json({ ok: true });
    });

    // RTPengine stats/info (optional)
    this.app.get('/rtp/info', (req, res) => {
      res.json({
        activeCalls: this.calls.size,
        registrations: this.registrations.size,
        uptime: process.uptime()
      });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', adapter: 'kamailio' });
    });
  }

  /**
   * Start the HTTP server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.httpPort, (err) => {
        if (err) return reject(err);
        console.log(`[KAMAILIO-ADAPTER] HTTP server listening on port ${this.httpPort}`);
        this.emit('connected');
        resolve();
      });
    });
  }

  /**
   * Send SIP request via Kamailio
   * Note: Unlike drachtio, we use HTTP to control rtpengine directly
   */
  async request(uri, options) {
    // For Kamailio, we don't have direct SIP request capability like drachtio-srf
    // Instead, we would need to use Kamailio's uac module via its RPC interface
    console.log(`[KAMAILIO-ADAPTER] Request to ${uri}: ${options.method}`);
    throw new Error('Direct SIP requests not implemented - use Kamailio UAC module');
  }

  /**
   * Get call by ID
   */
  getCall(callId) {
    return this.calls.get(callId);
  }

  /**
   * Get all active calls
   */
  getActiveCalls() {
    return Array.from(this.calls.values());
  }

  /**
   * Get registration for extension
   */
  getRegistration(extension) {
    return this.registrations.get(extension);
  }

  /**
   * Send RTP offer to rtpengine
   */
  async rtpOffer(callId, sdp, options = {}) {
    // Connect to rtpengine via UDP control socket
    const { createRtpEngine } = require('./rtpengine-client');
    const rtp = createRtpEngine({ port: 7722 });

    return rtp.offer({
      'call-id': callId,
      'from-tag': options.fromTag || crypto.randomUUID(),
      'sdp': sdp,
      'ICE': 'remove',
      'replace': ['origin', 'session-connection']
    });
  }

  /**
   * Send RTP answer to rtpengine
   */
  async rtpAnswer(callId, sdp, options = {}) {
    const { createRtpEngine } = require('./rtpengine-client');
    const rtp = createRtpEngine({ port: 7722 });

    return rtp.answer({
      'call-id': callId,
      'from-tag': options.fromTag,
      'to-tag': options.toTag || crypto.randomUUID(),
      'sdp': sdp,
      'ICE': 'remove',
      'replace': ['origin', 'session-connection']
    });
  }

  /**
   * Delete RTP session
   */
  async rtpDelete(callId) {
    const { createRtpEngine } = require('./rtpengine-client');
    const rtp = createRtpEngine({ port: 7722 });

    return rtp.delete({
      'call-id': callId
    });
  }

  /**
   * Stop and cleanup
   */
  stop() {
    if (this.server) {
      this.server.close();
    }
    this.calls.clear();
    this.registrations.clear();
  }
}

/**
 * Create adapter instance
 */
function createAdapter(options) {
  return new KamailioAdapter(options);
}

module.exports = {
  KamailioAdapter,
  createAdapter
};
