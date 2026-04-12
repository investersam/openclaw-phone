#!/bin/bash
# ============================================================================
# OpenClaw Phone Startup Script
# ============================================================================
# Free alternative - uses Edge TTS + local Whisper + OpenClaw CLI
# Automatically detects your LAN IP and starts the voice services.
# Works on both Mac and Linux.
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "  OpenClaw Phone Startup"
echo "  (Free version: Edge TTS + Whisper)"
echo "======================================"

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="mac"
    DETECTED_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
else
    OS="linux"
    DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ip route get 1 | awk '{print $7;exit}' 2>/dev/null || echo "")
fi

echo -e "Detected OS: ${GREEN}$OS${NC}"

# Check if EXTERNAL_IP is already set in .env
if [ -f .env ]; then
    EXISTING_IP=$(grep "^EXTERNAL_IP=" .env | cut -d'=' -f2)
fi

# Determine which IP to use
if [ -n "$EXTERNAL_IP" ]; then
    IP_TO_USE="$EXTERNAL_IP"
    echo -e "Using EXTERNAL_IP from environment: ${GREEN}$IP_TO_USE${NC}"
elif [ -n "$EXISTING_IP" ] && [ "$EXISTING_IP" != "10.0.0.100" ]; then
    IP_TO_USE="$EXISTING_IP"
    echo -e "Using EXTERNAL_IP from .env: ${GREEN}$IP_TO_USE${NC}"
elif [ -n "$DETECTED_IP" ]; then
    IP_TO_USE="$DETECTED_IP"
    echo -e "Using detected LAN IP: ${GREEN}$IP_TO_USE${NC}"
else
    echo -e "${RED}ERROR: Could not detect LAN IP${NC}"
    echo "Please set EXTERNAL_IP manually:"
    echo "  export EXTERNAL_IP=your.lan.ip.here"
    echo "  ./start-openclaw.sh"
    exit 1
fi

# Check for Podman
if ! command -v podman &> /dev/null && ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: Podman or Docker not found${NC}"
    echo "Install Podman: https://podman.io/getting-started/installation"
    exit 1
fi

# Use podman if available, otherwise docker
if command -v podman &> /dev/null; then
    CONTAINER_CMD="podman"
else
    CONTAINER_CMD="docker"
fi

echo -e "Using container runtime: ${GREEN}$CONTAINER_CMD${NC}"

# Start OpenClaw API server
echo ""
echo "Starting OpenClaw API server..."
cd "$SCRIPT_DIR/openclaw-api-server"
node server.js &
API_PID=$!
echo "OpenClaw API server started (PID: $API_PID)"

# Go back to script dir
cd "$SCRIPT_DIR"

# Start voice containers
echo ""
echo "Starting voice containers..."
if [ -f "podman-compose.yml" ]; then
    $CONTAINER_CMD-compose up -d
elif [ -f "docker-compose.yml" ]; then
    $CONTAINER_CMD-compose up -d
else
    echo -e "${YELLOW}WARNING: No compose file found, skipping containers${NC}"
fi

echo ""
echo "======================================"
echo -e "  ${GREEN}OpenClaw Phone Started!${NC}"
echo "======================================"
echo ""
echo "API server: http://localhost:3333"
echo "Voice app:   http://localhost:3000"
echo ""
echo "To test:"
echo "  curl -X POST http://localhost:3333/ask \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"prompt\": \"Hello!\"}'"
echo ""
echo "Press Ctrl+C to stop"
echo "======================================"

# Wait for interrupt
trap "echo ''; echo 'Stopping...'; kill $API_PID 2>/dev/null; $CONTAINER_CMD-compose down 2>/dev/null; exit" INT TERM

wait