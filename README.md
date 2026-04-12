<p align="center">
  <img src="assets/logo.png" alt="OpenClaw Phone" width="200">
</p>

# OpenClaw Phone

Voice interface for OpenClaw via SIP/3CX. Call your AI, and your AI can call you.

**Free alternative to Claude Phone** — uses Edge TTS and local Whisper instead of paid APIs.

## What is this?

OpenClaw Phone gives your OpenClaw installation a phone number. You can:

- **Inbound**: Call an extension and talk to OpenClaw - run commands, check status, ask questions
- **Outbound**: Your server can call YOU with alerts, then have a conversation about what to do

## What's Free?

| Original (Paid) | OpenClaw Phone (Free) |
|-----------------|--------------|
| ElevenLabs ($) | Edge TTS (Microsoft, free) |
| OpenAI Whisper ($) | Local faster-whisper (free) |
| Claude Code (Claude Max) | OpenClaw (free, works with Ollama!) |

## Prerequisites

| Requirement | Where to Get It | Notes |
|-------------|-----------------|-------|
| **3CX Cloud Account** | [3cx.com](https://www.3cx.com/) | Free tier works |
| **OpenClaw** | [openclaw.ai](https://openclaw.ai/) | Free AI agent |
| **Node.js 18+** | [nodejs.org](https://nodejs.org/) | |
| **Python 3.10+** | [python.org](https://python.org/) | For faster-whisper |
| **Podman** | [podman.io](https://podman.io/) | Docker alternative (free) |

## Platform Support

| Platform | Status |
|----------|--------|
| **macOS** | Fully supported |
| **Linux** | Fully supported (including Raspberry Pi) |
| **Windows** | Not supported (may work with WSL) |

## Quick Start

### 1. Install

```bash
curl -sSL https://raw.githubusercontent.com/investersam/openclaw-phone/main/install.sh | bash
```

The installer will:
- Check for Node.js 18+, Podman, Python, and git (offers to install if missing)
- Clone the repository to `~/openclaw-phone`
- Install Python venv with faster-whisper
- Install Node.js dependencies
- Create the `claude-phone` command

### 2. Setup

```bash
claude-phone setup
```

The setup wizard asks what you're installing:

| Type | Use Case | What It Configures |
|------|----------|-------------------|
| **Voice Server** | Pi or dedicated voice box | Podman containers, connects to remote API server |
| **API Server** | Mac/Linux with OpenClaw | Just the OpenClaw API wrapper |
| **Both** | All-in-one single machine | Everything on one box |

### 3. Start

```bash
# Option A: Use the startup script
./start-openclaw.sh

# Option B: Manual start
# Terminal 1: Start OpenClaw API server
cd ~/openclaw-phone/openclaw-api-server
node server.js

# Terminal 2: Start voice containers
cd ~/openclaw-phone
podman-compose up -d
```

## Deployment Modes

### All-in-One (Single Machine)

Best for: Mac or Linux server that's always on and has OpenClaw installed.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Phone                                                  │
│      │                                                       │
│      ↓ Call extension 9000                                  │
│  ┌─────────────┐                                            │
│  │     3CX     │  ← Cloud PBX                               │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ↓                                                    │
│  ┌─────────────────────────────────────────────┐           │
│  │     Single Server (Mac/Linux)                │           │
│  │  ┌───────────┐    ┌───────────────────┐    │           │
│  │  │ voice-app │ ←→ │ openclaw-api-srv  │    │           │
│  │  │ (Docker)  │    │ (OpenClaw CLI)    │    │           │
│  │  └───────────┘    └───────────────────┘    │           │
│  └─────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**Setup:**
```bash
claude-phone setup    # Select "Both"
./start-openclaw.sh   # Launches containers + API server
```

### Split Mode (Pi + API Server)

Best for: Dedicated Pi for voice services, OpenClaw running on your main machine.

```
┌─────────────────────────────────────────────────────────────┐
│  Your Phone                                                  │
│      │                                                       │
│      ↓ Call extension 9000                                  │
│  ┌─────────────┐                                            │
│  │     3CX     │  ← Cloud PBX                               │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ↓                                                    │
│  ┌─────────────┐         ┌─────────────────────┐           │
│  │ Raspberry Pi │   ←→   │ Mac/Linux with      │           │
│  │ (voice-app)  │  HTTP  │ OpenClaw CLI        │           │
│  └─────────────┘         │ (openclaw-api-srv)  │           │
│                          └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

**On your Pi (Voice Server):**
```bash
claude-phone setup    # Select "Voice Server", enter API server IP when prompted
claude-phone start    # Launches Podman containers
```

**On your Mac/Linux (API Server):**
```bash
claude-phone api-server    # Starts OpenClaw API wrapper on port 3333
```

Note: On the API server machine, you don't need to run `claude-phone setup` first - the `api-server` command works standalone.

## CLI Commands

| Command | Description |
|---------|-------------|
| `claude-phone setup` | Interactive configuration wizard |
| `claude-phone start` | Start services based on installation type |
| `claude-phone stop` | Stop all services |
| `claude-phone status` | Show service status |
| `claude-phone doctor` | Health check for dependencies and services |
| `claude-phone api-server [--port N]` | Start API server standalone (default: 3333) |
| `claude-phone device add` | Add a new device/extension |
| `claude-phone device list` | List configured devices |
| `claude-phone device remove <name>` | Remove a device |
| `claude-phone logs [service]` | Tail logs (voice-app, drachtio, freeswitch) |
| `claude-phone config show` | Display configuration (secrets redacted) |
| `claude-phone config path` | Show config file location |
| `claude-phone config reset` | Reset configuration |
| `claude-phone backup` | Create configuration backup |
| `claude-phone restore` | Restore from backup |
| `claude-phone update` | Update OpenClaw Phone |
| `claude-phone uninstall` | Complete removal |

## Voice Personalities

Each SIP extension can have its own identity with a unique name, voice, and personality prompt:

```bash
claude-phone device add
```

Example voices (all free Edge TTS):
- **Guy** (ext 9000) - Male US voice
- **Jenny** (ext 9001) - Female US voice
- **Aria** (ext 9002) - Expressive female US voice
- **Sara** (ext 9003) - Friendly female US voice
- **Ryan** (ext 9004) - Male UK voice
- **Sonia** (ext 9005) - Female UK voice

## API Endpoints

### OpenClaw API Server (port 3333)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/ask` | Send prompt to OpenClaw |
| POST | `/end-session` | Clean up session for a call |
| GET | `/health` | Health check |

### Voice App (port 3000)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/outbound-call` | Initiate an outbound call |
| GET | `/api/call/:callId` | Get call status |
| GET | `/api/calls` | List active calls |
| POST | `/api/query` | Query a device programmatically |
| GET | `/api/devices` | List configured devices |

See [Outbound API Reference](voice-app/README-OUTBOUND.md) for details.

## Testing

```bash
# Test OpenClaw API server
curl -X POST http://localhost:3333/ask \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What time is it?", "callId": "test"}'

# Test Edge TTS
npx node-edge-tts -t "Hello!" -v en-US-GuyNeural -f /tmp/test.mp3

# Test Whisper (if faster-whisper installed)
python voice-app/whisper-transcribe.py /tmp/test.mp3 --language en
```

## Troubleshooting

### Quick Diagnostics

```bash
claude-phone doctor    # Automated health checks
claude-phone status    # Service status
claude-phone logs      # View logs
```

### Common Issues

| Problem | Likely Cause | Solution |
|---------|--------------|----------|
| Calls connect but no audio | Wrong external IP | Re-run `claude-phone setup`, verify LAN IP |
| Extension not registering | 3CX SBC not running | Check 3CX admin panel |
| "Sorry, something went wrong" | API server unreachable | Check `claude-phone status` |
| Whisper not working | faster-whisper not installed | Run `pip install faster-whisper` |
| Port conflict on startup | 3CX SBC using port 5060 | Setup auto-detects this; re-run setup |

See [Troubleshooting Guide](docs/TROUBLESHOOTING.md) for more.

## Configuration

Configuration is stored in `~/.claude-phone/config.json` with restricted permissions (chmod 600).

```bash
claude-phone config show    # View config (secrets redacted)
claude-phone config path    # Show file location
```

## Development

```bash
# Run tests
npm test

# Lint
npm run lint
npm run lint:fix
```

## Documentation

- [CLI Reference](cli/README.md) - Detailed CLI documentation
- [Setup Guide](SETUP.md) - Free version setup instructions
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions
- [Outbound API](voice-app/README-OUTBOUND.md) - Outbound calling API reference
- [Deployment](voice-app/DEPLOYMENT.md) - Production deployment guide

## License

MIT

## Credits

Based on [NetworkChuck's Claude Phone](https://github.com/theNetworkChuck/claude-phone) — modified to work with OpenClaw and free services.
