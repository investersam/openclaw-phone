/**
 * FreeSWITCH ESL Client
 * Direct ESL connection to control FreeSWITCH
 * Replaces drachtio-fsmrf
 */

const net = require('net');
const EventEmitter = require('events');
const Parser = require('./esl-parser');

class ESLConnection extends EventEmitter {
  constructor(options = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 8021;
    this.password = options.password || 'ClueCon';
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.parser = new Parser();
    this.commands = new Map();
    this.commandId = 0;
    this.calls = new Map();

    this.setupParser();
  }

  setupParser() {
    this.parser.on('event', (event) => {
      this.handleEvent(event);
    });

    this.parser.on('response', (response) => {
      this.handleResponse(response);
    });
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        console.log(`[ESL] Connected to FreeSWITCH at ${this.host}:${this.port}`);
        this.connected = true;
      });

      this.socket.on('data', (data) => {
        this.parser.feed(data);
      });

      this.socket.on('close', () => {
        console.log('[ESL] Connection closed');
        this.connected = false;
        this.emit('disconnect');
      });

      this.socket.on('error', (err) => {
        console.error('[ESL] Socket error:', err.message);
        this.emit('error', err);
        if (!this.connected) {
          reject(err);
        }
      });

      this.once('auth', (success) => {
        if (success) {
          this.authenticated = true;
          this.emit('connect');
          resolve();
        } else {
          reject(new Error('Authentication failed'));
        }
      });

      this.socket.connect(this.port, this.host);
    });
  }

  handleEvent(event) {
    // Emit event for subscribers
    this.emit(event.eventName, event);
    this.emit('esl::event', event);

    // Handle specific events
    switch (event.eventName) {
      case 'CHANNEL_CREATE':
        this.handleChannelCreate(event);
        break;
      case 'CHANNEL_DESTROY':
        this.handleChannelDestroy(event);
        break;
      case 'CHANNEL_ANSWER':
        this.handleChannelAnswer(event);
        break;
      case 'DTMF':
        this.handleDTMF(event);
        break;
    }
  }

  handleResponse(response) {
    if (response.contentType === 'auth/request') {
      // Send auth
      this.sendCommand(`auth ${this.password}`);
      return;
    }

    if (response.contentType === 'command/reply') {
      const reply = response.headers['Reply-Text'];

      if (reply && reply.includes('+OK')) {
        if (!this.authenticated) {
          this.emit('auth', true);
        }
      }

      this.emit('response', response);
    }
  }

  handleChannelCreate(event) {
    const uuid = event.headers['Unique-ID'];
    const call = new Call(uuid, this);
    this.calls.set(uuid, call);
    this.emit('call::create', call);
  }

  handleChannelDestroy(event) {
    const uuid = event.headers['Unique-ID'];
    const call = this.calls.get(uuid);
    if (call) {
      call.emit('destroy');
      this.calls.delete(uuid);
      this.emit('call::destroy', call);
    }
  }

  handleChannelAnswer(event) {
    const uuid = event.headers['Unique-ID'];
    const call = this.calls.get(uuid);
    if (call) {
      call.emit('answer');
      this.emit('call::answer', call);
    }
  }

  handleDTMF(event) {
    const uuid = event.headers['Unique-ID'];
    const digit = event.headers['DTMF-Digit'];
    const call = this.calls.get(uuid);
    if (call) {
      call.emit('dtmf', digit);
    }
  }

  sendCommand(command) {
    if (!this.socket || !this.connected) {
      throw new Error('Not connected');
    }

    const cmd = `${command}\n\n`;
    this.socket.write(cmd);
  }

  sendApiCommand(command, args = '') {
    return new Promise((resolve, reject) => {
      const fullCmd = args ? `${command} ${args}` : command;

      const timeout = setTimeout(() => {
        reject(new Error('Command timeout'));
      }, 10000);

      const handler = (response) => {
        if (response.headers['Content-Type'] === 'api/response') {
          clearTimeout(timeout);
          this.off('response', handler);
          resolve(response.body);
        }
      };

      this.on('response', handler);
      this.sendCommand(`api ${fullCmd}`);
    });
  }

  subscribe(events) {
    const eventList = Array.isArray(events) ? events.join(' ') : events;
    this.sendCommand(`event plain ${eventList}`);
  }

  disconnect() {
    if (this.socket) {
      this.socket.end();
    }
  }

  getCall(uuid) {
    return this.calls.get(uuid);
  }
}

class Call extends EventEmitter {
  constructor(uuid, esl) {
    super();
    this.uuid = uuid;
    this.esl = esl;
    this.active = true;
  }

  async answer() {
    await this.esl.sendApiCommand('uuid_answer', this.uuid);
    this.emit('answered');
  }

  async hangup(cause = 'NORMAL_CLEARING') {
    await this.esl.sendApiCommand('uuid_kill', `${this.uuid} ${cause}`);
    this.active = false;
  }

  async play(file) {
    // file can be local path or http URL
    const path = file.startsWith('http') ? file : `/app/audio/${file}`;
    return this.esl.sendApiCommand('uuid_broadcast', `${this.uuid} ${path} both`);
  }

  async speak(text, voice = 'en-US-GuyNeural') {
    // Use TTS (requires mod_tts or external TTS service)
    // For now, generate TTS file and play it
    // This would integrate with the TTS service
    throw new Error('TTS via ESL not implemented - use pre-generated files');
  }

  async forkAudio(wsUrl, options = {}) {
    // Start audio fork for streaming to WebSocket
    const cmd = `lua fork_audio.lua ${this.uuid} ${wsUrl}`;
    return this.esl.sendApiCommand('bgapi', cmd);
  }

  async stopForkAudio() {
    return this.esl.sendApiCommand('uuid_break', this.uuid);
  }

  async stopPlayback() {
    return this.esl.sendApiCommand('uuid_break', this.uuid);
  }

  async setVariable(name, value) {
    return this.esl.sendApiCommand('uuid_setvar', `${this.uuid} ${name} ${value}`);
  }

  async getVariable(name) {
    return this.esl.sendApiCommand('uuid_getvar', `${this.uuid} ${name}`);
  }
}

// Simple ESL parser
class Parser extends EventEmitter {
  constructor() {
    super();
    this.buffer = Buffer.alloc(0);
  }

  feed(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.parse();
  }

  parse() {
    while (this.buffer.length > 0) {
      // Look for double newline (header terminator)
      const headerEnd = this.buffer.indexOf('\n\n');
      if (headerEnd === -1) return;

      const headerSection = this.buffer.slice(0, headerEnd).toString();
      const lines = headerSection.split('\n');

      const headers = {};
      let contentType = null;
      let contentLength = 0;

      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          headers[key] = value;

          if (key === 'Content-Type') {
            contentType = value;
          }
          if (key === 'Content-Length') {
            contentLength = parseInt(value, 10) || 0;
          }
        }
      }

      const totalLength = headerEnd + 2 + contentLength;
      if (this.buffer.length < totalLength) return;

      const body = this.buffer.slice(headerEnd + 2, totalLength).toString();
      this.buffer = this.buffer.slice(totalLength);

      if (contentType === 'text/event-plain' || contentType === 'text/event-json') {
        const event = this.parseEvent(body, contentType);
        this.emit('event', event);
      } else {
        this.emit('response', {
          contentType,
          headers,
          body
        });
      }
    }
  }

  parseEvent(body, contentType) {
    const event = {
      eventName: '',
      headers: {}
    };

    if (contentType === 'text/event-json') {
      try {
        const json = JSON.parse(body);
        event.headers = json;
        event.eventName = json['Event-Name'];
      } catch (e) {
        console.error('Failed to parse JSON event:', e);
      }
    } else {
      const lines = body.split('\n');
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          event.headers[key] = value;

          if (key === 'Event-Name') {
            event.eventName = value;
          }
        }
      }
    }

    return event;
  }
}

module.exports = {
  ESLConnection,
  Call,
  Parser
};
