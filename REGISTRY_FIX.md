# Fixing Podman Registry Issue on Raspberry Pi

## The Problem
Podman on Raspberry Pi doesn't have Docker Hub configured as a default registry, so it can't pull images like `drachtio/drachtio-server:latest`.

## Solution

### Option 1: Configure Podman to use Docker Hub (Recommended)

Create or edit the registries configuration:

```bash
sudo nano /etc/containers/registries.conf
```

Add this content:

```toml
unqualified-search-registries = ["docker.io"]

[[registry]]
location = "docker.io"
```

Then try running the containers again:

```bash
cd ~/openclaw-phone
podman-compose -f docker-compose.yml -f docker-compose.bridge.yml up -d
```

### Option 2: Pre-pull the images with full Docker Hub path

```bash
podman pull docker.io/drachtio/drachtio-server:latest
podman pull docker.io/drachtio/drachtio-freeswitch-mrf:latest
```

Then run compose again.

### Option 3: Use podman pull with specific image names in compose

Modify the docker-compose.yml to use fully qualified image names:

```yaml
services:
  drachtio:
    image: docker.io/drachtio/drachtio-server:latest
    # ... rest of config
  
  freeswitch:
    image: docker.io/drachtio/drachtio-freeswitch-mrf:latest
    # ... rest of config
```

## Note

I created a basic `.env` file with placeholder values. You'll need to update:
- `EXTERNAL_IP` to your Pi's actual LAN IP
- All the SIP/3CX settings when you're ready to connect to your phone system
- API keys for ElevenLabs and OpenAI
