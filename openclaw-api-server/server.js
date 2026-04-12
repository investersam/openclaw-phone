/**
 * OpenClaw API Server
 * HTTP server that wraps OpenClaw CLI with session management
 * Replaces claude-api-server for local-only voice interface
 *
 * Usage:
 *   node server.js
 *
 * Endpoints:
 *   POST /ask - Send a prompt to OpenClaw (with optional callId for session)
 *   POST /end-session - Clean up session for a call
 *   GET /health - Health check
 */

const express = require('express');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;

// Session management: map callId (from phone) to sessionId (OpenClaw session)
const sessions = new Map();

app.use(express.json({ limit: '50mb' }));

/**
 * Run OpenClaw agent command and return the response
 */
function runOpenClaw(prompt, sessionId = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // Build command
    const args = ['agent', '--message', prompt, '--json'];
    
    if (sessionId) {
      args.push('--session-id', sessionId);
    }
    
    console.log(`[${new Date().toISOString()}] OPENCLAW: Running with session: ${sessionId || 'new'}`);
    
    const proc = spawn('openclaw', args, {
      cwd: process.env.OPENCLAW_DIR || path.join(process.env.HOME || '/home/openclaw', '.openclaw', 'workspace'),
      env: {
        ...process.env,
        OPENCLAW_STATE_DIR: process.env.OPENCLAW_DIR || path.join(process.env.HOME || '/home/openclaw', '.openclaw')
      }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      
      if (code !== 0 && !stdout) {
        console.error(`[OPENCLAW] Error (code ${code}): ${stderr}`);
        reject(new Error(`OpenClaw exited with code ${code}: ${stderr}`));
        return;
      }

      // Parse JSON response
      let response = stdout.trim();
      let parsed = null;
      
      try {
        // Try to extract JSON from output (may have other text)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Not JSON, use raw text
      }

      // Extract response from OpenClaw's JSON format
      let textResponse = response;
      if (parsed && parsed.result?.payloads?.[0]?.text) {
        textResponse = parsed.result.payloads[0].text;
      } else if (parsed?.reply) {
        textResponse = parsed.reply;
      } else if (parsed?.message) {
        textResponse = parsed.message;
      }

      resolve({
        success: true,
        response: textResponse,
        parsed,
        duration_ms: duration,
        sessionId: sessionId
      });
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn OpenClaw: ${err.message}`));
    });
  });
}

/**
 * POST /ask - Send a prompt to OpenClaw
 */
app.post('/ask', async (req, res) => {
  const { prompt, callId, devicePrompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Missing prompt' });
  }

  // Build full prompt with device personality if provided
  let fullPrompt = prompt;
  if (devicePrompt) {
    fullPrompt = `${devicePrompt}\n\nUser: ${prompt}`;
  }

  // Get or create session for this call
  let sessionId = sessions.get(callId);
  if (!sessionId && callId) {
    // Generate a session ID for this call
    sessionId = `call-${callId}`;
    sessions.set(callId, sessionId);
  }

  try {
    const result = await runOpenClaw(fullPrompt, sessionId);
    res.json(result);
  } catch (error) {
    console.error('[OPENCLAW] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /end-session - Clean up session for a call
 */
app.post('/end-session', (req, res) => {
  const { callId } = req.body;
  
  if (callId && sessions.has(callId)) {
    sessions.delete(callId);
    console.log(`[${new Date().toISOString()}] OPENCLAW: Ended session for call: ${callId}`);
  }
  
  res.json({ success: true });
});

/**
 * GET /health - Health check
 */
app.get('/health', (req, res) => {
  // Check if OpenClaw is available
  try {
    execSync('openclaw --version', { timeout: 5000 });
    res.json({ 
      status: 'ok', 
      service: 'openclaw-api-server',
      version: '1.0.0',
      openclaw: 'available'
    });
  } catch (error) {
    res.json({ 
      status: 'error', 
      service: 'openclaw-api-server',
      version: '1.0.0',
      openclaw: 'unavailable',
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('  OpenClaw API Server Started');
  console.log(`  Port: ${PORT}`);
  console.log('='.repeat(50));
});