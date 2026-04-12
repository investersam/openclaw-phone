# OpenClaw Phone Setup Guide

**Free alternative to Claude Phone** — uses Edge TTS + local Whisper + OpenClaw CLI.

## What's Free?

| Original (Paid) | OpenClaw Phone (Free) |
|-----------------|----------------------|
| ElevenLabs ($) | Edge TTS (Microsoft) |
| OpenAI Whisper ($) | Local faster-whisper |
| Claude Code (Claude Max) | OpenClaw (works with Ollama!) |

## Prerequisites

- **3CX Cloud Account** - Free at [3cx.com](https://www.3cx.com/)
- **OpenClaw** - Install via `curl -fsSL https://openclaw.ai/install.sh | bash`
- **Node.js 18+**
- **Python 3.10+**
- **Podman** or **Docker**
- **faster-whisper** (for local STT)

## Installation

### 1. Install faster-whisper

```bash
# Create virtual environment
python3 -m venv ~/.openclaw/whisper-venv
source ~/.openclaw/whisper-venv/bin/activate

# Install faster-whisper
pip install faster-whisper
```

### 2. Install OpenClaw API server dependencies

```bash
cd ~/openclaw-phone/openclaw-api-server
npm install
```

### 3. Configure .env

```bash
cp .env.example .env
# Edit .env with your settings
```

Required:
- `EXTERNAL_IP` - Your server's LAN IP
- `SIP_DOMAIN` - Your 3CX domain (e.g., `myphone.3cx.us`)
- `SIP_EXTENSION` - Your SIP extension
- `SIP_AUTH_ID` - Your SIP auth username
- `SIP_PASSWORD` - Your SIP auth password

## Running

### Option A: Use start-openclaw.sh

```bash
cd ~/openclaw-phone
./start-openclaw.sh
```

### Option B: Manual

```bash
# Terminal 1: Start OpenClaw API server
cd ~/openclaw-phone/openclaw-api-server
node server.js

# Terminal 2: Start voice containers
cd ~/openclaw-phone
podman-compose up -d
```

## Testing

```bash
# Test API server
curl -X POST http://localhost:3333/ask \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!", "callId": "test"}'

# Test TTS
npx node-edge-tts -t "Hello!" -v en-US-GuyNeural -f /tmp/test.mp3
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/ask` | Send prompt to OpenClaw |
| POST | `/end-session` | Clean up session |
| GET | `/health` | Health check |

## Troubleshooting

### "faster-whisper not found"
```bash
source ~/.openclaw/whisper-venv/bin/activate
pip install faster-whisper
```

### No audio?
- Check `EXTERNAL_IP` in .env matches your actual LAN IP
- Verify SIP credentials

### Whisper not transcribing?
- Make sure faster-whisper is installed in the venv
- Or use `--model tiny` for faster transcription

## Credits

Based on [NetworkChuck's Claude Phone](https://github.com/theNetworkChuck/claude-phone)