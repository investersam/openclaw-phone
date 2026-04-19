/**
 * RTPengine UDP Control Client
 * Communicates with rtpengine for media management
 */

const dgram = require('dgram');
const crypto = require('crypto');
const { Buffer } = require('buffer');

class RTPengineClient {
  constructor(options = {}) {
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 7722;
    this.socket = null;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('message', (msg) => {
        this.handleResponse(msg);
      });

      this.socket.on('error', (err) => {
        console.error('[RTPENGINE] Socket error:', err);
      });

      this.socket.bind(() => {
        resolve();
      });
    });
  }

  handleResponse(msg) {
    // Parse rtpengine response
    const response = msg.toString();
    const parts = response.split(' ');

    if (parts.length < 2) return;

    const cookie = parts[0];
    const data = parts.slice(1).join(' ');

    const pending = this.pending.get(cookie);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(cookie);

      const parsed = this.parseResponse(data);
      if (parsed.result === 'ok') {
        pending.resolve(parsed);
      } else {
        pending.reject(new Error(parsed.result || 'Unknown error'));
      }
    }
  }

  parseResponse(data) {
    const result = {};
    const lines = data.split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        result[key] = value;
      }
    }

    return result;
  }

  sendCommand(command, params) {
    return new Promise((resolve, reject) => {
      const cookie = crypto.randomBytes(8).toString('hex');

      // Build command string
      let cmd = `${cookie} ${command}`;
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          cmd += `\n${key}: ${value}`;
        }
      }

      const buffer = Buffer.from(cmd);

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pending.delete(cookie);
        reject(new Error('RTPengine timeout'));
      }, 5000);

      this.pending.set(cookie, { resolve, reject, timeout });

      this.socket.send(buffer, this.port, this.host, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pending.delete(cookie);
          reject(err);
        }
      });
    });
  }

  // Commands
  offer(params) {
    return this.sendCommand('offer', params);
  }

  answer(params) {
    return this.sendCommand('answer', params);
  }

  delete(params) {
    return this.sendCommand('delete', params);
  }

  query(params) {
    return this.sendCommand('query', params);
  }

  list() {
    return this.sendCommand('list', {});
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
    // Reject all pending
    for (const [cookie, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client closed'));
    }
    this.pending.clear();
  }
}

function createRtpEngine(options) {
  return new RTPengineClient(options);
}

module.exports = {
  RTPengineClient,
  createRtpEngine
};
