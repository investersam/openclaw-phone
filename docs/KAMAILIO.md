# Kamailio SIP Support

This document describes how to use **Kamailio** instead of **drachtio** for SIP handling.

## Why Kamailio?

| Feature | drachtio | Kamailio |
|---------|----------|----------|
| Architecture | Application framework | SIP router/proxy |
| Complexity | Simpler | More complex but flexible |
| Scalability | Single Node | Multiple nodes with shared database |
| Registration | Handled internally | Via external database |
| Use Case | Simple setups | Production, clustering, load balancing |

## Architecture

```
Before (drachtio):
┌─────────┐    SIP     ┌──────────┐    ESL    ┌──────────────┐
│  3CX    │ ───────────→│ drachtio │ ─────────→│  FreeSWITCH  │
└─────────┘             └──────────┘           └──────────────┘
                              ↑                      ↓
                              │                 (controls)
                              └────────────── Voice App (Node.js)

After (Kamailio):
┌─────────┐    SIP     ┌──────────┐    SIP    ┌──────────────┐
│  3CX    │ ───────────→│ Kamailio │ ─────────→│  FreeSWITCH  │
└─────────┘             └──────────┘           └──────────────┘
                              │                        ↓
                              └──────────── Voice App (Node.js)
                                   HTTP callbacks
```

## Migration Steps

### 1. Update docker-compose.yml

Comment out `drachtio` service and uncomment `kamailio` service:

```yaml
# services:
#   drachtio:
#     ...

services:
  kamailio:
    image: kamailio/kamailio-ci:latest
    container_name: kamailio
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./kamailio/kamailio-simple.cfg:/etc/kamailio/kamailio.cfg:ro
    command: >
      kamailio
      -f /etc/kamailio/kamailio.cfg
      -D

  voice-app:
    depends_on:
      - freeswitch
      - kamailio  # Changed from drachtio
```

### 2. Use Kamailio Entry Point

The voice app has two entry points:

- `index.js` — Uses drachtio (default)
- `index-kamailio.js` — Uses Kamailio + ESL

Update the voice-app Dockerfile or start command:

```bash
# Instead of:
node index.js

# Use:
node index-kamailio.js
```

Or create an environment variable to choose:

```yaml
voice-app:
  environment:
    - SIP_BACKEND=kamailio  # or drachtio
```

### 3. Restart Services

```bash
podman-compose down
podman-compose up -d
```

## Configuration

### Kamailio Config

The config file `kamailio/kamailio-simple.cfg`:

- Routes SIP traffic from 3CX to FreeSWITCH
- Sends HTTP callbacks to voice app on port 3000
- Handles: REGISTER, INVITE, BYE

### FreeSWITCH ESL

The ESL (Event Socket Library) connection:

- Host: `127.0.0.1:8021`
- Password: Set in FreeSWITCH config (default: `JambonzR0ck$`)
- Used for: Call control, audio playback, forking

## Limitations

The Kamailio implementation is currently **simplified**:

1. **Call correlation**: SIP Call-ID to FreeSWITCH UUID mapping needs improvement
2. **Audio forking**: Works but may need VAD (Voice Activity Detection) tuning
3. **DTMF handling**: Requires additional integration
4. **Registration**: Forwarded to FreeSWITCH (Kamailio doesn't maintain location DB)

## Switching Back to drachtio

1. Comment out `kamailio` service in docker-compose.yml
2. Uncomment `drachtio` service
3. Update `voice-app` to use `index.js` instead of `index-kamailio.js`
4. Restart: `podman-compose up -d`

## Troubleshooting

### Kamailio won't start

Check config syntax:
```bash
podman logs kamailio
```

### Calls not reaching voice app

Check HTTP callbacks:
```bash
# In voice-app container
podman logs voice-app | grep KAMAILIO
```

### FreeSWITCH ESL connection failed

Verify FreeSWITCH ESL is enabled:
```bash
# In FreeSWITCH container
fs_cli -x "show event\nsocket"
```

## Further Development

To fully implement the Kamailio version:

1. Complete `index-kamailio.js` conversation loop with VAD
2. Implement proper Call-ID to UUID correlation
3. Add DTMF detection via ESL events
4. Consider Kamailio location database for registration handling

See `voice-app/index-kamailio.js` for the entry point.
