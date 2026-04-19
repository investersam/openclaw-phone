# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

**OpenClaw Phone** is a free voice interface for AI agents via SIP/3CX. It replaces the paid Claude Phone stack with free alternatives: Edge TTS (instead of ElevenLabs), local Whisper (instead of OpenAI Whisper API), and OpenClaw (instead of Claude Max).

## Common Development Commands

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:cli
cd voice-app && node --test test/**/*.test.js

# Linting
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues

# Start services locally (not in containers)
cd openclaw-api-server && node server.js  # Port 3333
cd voice-app && node index.js             # Port 3000

# Build and run with Docker/Podman
podman-compose up -d
podman-compose logs -f voice-app

# CLI commands (after install)
claude-phone setup    # Interactive configuration
claude-phone doctor   # Health checks
claude-phone status   # Service status
```

## High-Level Architecture

### Call Flow (Inbound)

```
Phone → 3CX Cloud PBX → drachtio (SIP) → FreeSWITCH (media) → voice-app (Node.js)
                                              ↓
                                       Audio fork via
                                       WebSocket (port 3001)
                                              ↓
                                        OpenClaw API
                                       (port 3333)
```

**Key architectural constraint**: All containers use `network_mode: host` because FreeSWITCH must advertise its actual LAN IP in SDP packets for RTP to work. Bridge networking causes one-way audio.

### Module Boundaries

**voice-app** (CommonJS, Dockerized):
- `index.js` — Entry point. Connects to drachtio-srf and drachtio-fsmrf, waits for both to be ready before starting HTTP/WebSocket servers
- `lib/sip-handler.js` — Handles SIP INVITEs from drachtio. Creates media endpoint via FreeSWITCH, starts audio fork
- `lib/conversation-loop.js` — Core conversation flow: VAD → DTMF → Whisper transcription → OpenClaw → TTS response
- `lib/audio-fork.js` — WebSocket server receiving L16 PCM audio streams from FreeSWITCH
- `lib/tts-service.js` — Edge TTS wrapper, generates MP3s served via HTTP on port 3000
- `lib/whisper-client.js` — Wraps local faster-whisper Python process
- `lib/claude-bridge.js` — HTTP client to openclaw-api-server

**cli** (ES Modules, runs on host):
- Interactive setup wizard, service management via `claude-phone` command
- Manages config in `~/.claude-phone/config.json`

**openclaw-api-server** (CommonJS):
- HTTP wrapper around `openclaw` CLI binary
- Session management per `callId` for multi-turn conversations

### Port Allocation Strategy

**Critical**: Avoid ports used by 3CX SBC (20000-20099). The config uses:

| Service | Port | Notes |
|---------|------|-------|
| drachtio | 5060 | SIP UDP/TCP. Change to 5070 if 3CX SBC runs locally |
| drachtio admin | 9022 | Internal control port |
| FreeSWITCH ESL | 8021 | Event Socket Library for control |
| FreeSWITCH SIP | 5080 | Internal, not exposed externally |
| voice-app HTTP | 3000 | TTS files, REST API |
| voice-app WS | 3001 | Audio fork streaming |
| openclaw-api | 3333 | OpenClaw API wrapper |
| RTP | 30000-30100 | FreeSWITCH media (avoid 20000-20099) |

### Device/Personality System

Each SIP extension (9000, 9001, etc.) maps to a device configuration with:
- `name` — Persona name (e.g., "Guy", "Jenny")
- `voiceId` — Edge TTS voice (e.g., `en-US-GuyNeural`)
- `prompt` — System prompt prepended to OpenClaw queries
- `extension` — SIP extension number

Device configs live in `voice-app/config/devices.json`. The CLI `device add` command generates these with interactive prompts for voice selection.

### Media Flow Details

1. FreeSWITCH bridges audio between caller and voice-app
2. `mod_audio_fork` streams caller audio as L16 PCM via WebSocket to voice-app
3. voice-app uses VAD (Voice Activity Detection) to detect speech segments
4. DTMF # key can also end speech capture early
5. Audio is buffered, transcribed by Whisper, sent to OpenClaw
6. TTS generates MP3, served via HTTP, played by FreeSWITCH `uuid_broadcast`

### Session Management

- Each phone call gets a unique `callId` (SIP Call-ID)
- `openclaw-api-server` maintains sessions in a Map: `callId → sessionId`
- Sessions are used for multi-turn context within a single call
- `POST /end-session` cleans up when call ends

## Key Design Decisions

**CommonJS for voice-app**: Required for drachtio-fsmrf compatibility (drachtio ecosystem uses CommonJS).

**ES Modules for CLI**: Modern Node.js, better for CLI tooling with `commander`.

**Host networking**: Non-negotiable for FreeSWITCH RTP. The container must see the host's network interfaces to advertise correct IPs in SDP.

**Separate API server**: `openclaw-api-server` runs where OpenClaw CLI is installed (may be different machine from voice-app). Split mode: Pi runs voice-app, Mac runs API server.

**Audio files are ephemeral**: TTS generates MP3s in `AUDIO_DIR`, cleaned up after 5 minutes. HTTP server serves them for FreeSWITCH to fetch.

## DevFlow Slash Commands

The `.claude/commands/` directory contains DevFlow 2.0 commands:
- `/feature spec [name]` — Create feature spec in `src/features/`
- `/feature start [name]` — Build with TDD
- `/feature ship` — Review and merge
- `/fix [N]` — Fix GitHub issue #N
- `/investigate [problem]` — Debug without changing code

## Environment-Specific Notes

**3CX SBC on same machine**: If 3CX SBC runs locally, it uses port 5060. Change drachtio to use 5070 in both `.env` (DRACHTIO_SIP_PORT) and `docker-compose.yml` drachtio command line.

**Free version differences**: This is the "free" fork. Key changes from original Claude Phone:
- ElevenLabs → Edge TTS (Microsoft, free)
- OpenAI Whisper API → local faster-whisper
- Claude Code → OpenClaw

**Kamailio alternative**: `kamailio/` directory contains experimental config to replace drachtio with Kamailio + ESL direct to FreeSWITCH. See `docs/KAMAILIO.md`.
