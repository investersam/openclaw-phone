#!/bin/bash
set -e

# OpenClaw Phone CLI Installer (Free Version)
# Usage: curl -sSL https://raw.githubusercontent.com/investersam/openclaw-phone/main/install.sh | bash

INSTALL_DIR="$HOME/openclaw-phone"
REPO_URL="https://github.com/investersam/openclaw-phone.git"

echo "🎯 OpenClaw Phone CLI Installer (Free version)"
echo ""
echo "This installer sets up OpenClaw Phone with:"
echo "  • Edge TTS (free Microsoft text-to-speech)"
echo "  • Local Whisper (free speech-to-text)"
echo "  • OpenClaw (free AI agent)"
echo ""

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin*)
    echo "✓ Detected macOS"
    BIN_DIR="/usr/local/bin"
    PKG_MANAGER="brew"
    ;;
  Linux*)
    echo "✓ Detected Linux"
    BIN_DIR="$HOME/.local/bin"
    mkdir -p "$BIN_DIR"
    # Detect package manager
    if command -v apt-get &> /dev/null; then
      PKG_MANAGER="apt"
    elif command -v dnf &> /dev/null; then
      PKG_MANAGER="dnf"
    elif command -v pacman &> /dev/null; then
      PKG_MANAGER="pacman"
    else
      PKG_MANAGER="unknown"
    fi
    ;;
  *)
    echo "✗ Unsupported OS: $OS"
    exit 1
    ;;
esac

# Function to install Node.js
install_nodejs() {
  echo ""
  echo "📦 Installing Node.js..."
  case "$PKG_MANAGER" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
      ;;
    dnf)
      sudo dnf install -y nodejs npm
      ;;
    pacman)
      sudo pacman -S --noconfirm nodejs npm
      ;;
    brew)
      brew install node
      ;;
    *)
      echo "✗ Cannot auto-install Node.js"
      echo "  Install from: https://nodejs.org/"
      exit 1
      ;;
  esac
  echo "✓ Node.js installed: $(node -v)"
}

# Function to install Podman
install_podman() {
  echo ""
  echo "📦 Installing Podman..."
  case "$PKG_MANAGER" in
    apt)
      sudo apt-get update && sudo apt-get install -y podman podman-compose
      ;;
    dnf)
      sudo dnf install -y podman podman-compose
      ;;
    pacman)
      sudo pacman -S --noconfirm podman podman-compose
      ;;
    brew)
      brew install podman
      ;;
    *)
      echo "✗ Cannot auto-install Podman"
      echo "  Install from: https://podman.io/"
      exit 1
      ;;
  esac
  echo "✓ Podman installed"
}

# Function to install Docker
install_docker() {
  echo ""
  echo "📦 Installing Docker..."
  case "$PKG_MANAGER" in
    apt)
      curl -fsSL https://get.docker.com | sudo sh
      sudo usermod -aG docker $USER
      echo "⚠️  Log out and back in for Docker group to take effect"
      ;;
    dnf)
      sudo dnf install -y docker
      sudo systemctl start docker
      sudo systemctl enable docker
      sudo usermod -aG docker $USER
      ;;
    pacman)
      sudo pacman -S --noconfirm docker
      sudo systemctl start docker
      sudo systemctl enable docker
      sudo usermod -aG docker $USER
      ;;
    brew)
      echo "📦 Docker Desktop required on macOS"
      echo "  Install from: https://www.docker.com/products/docker-desktop"
      read -p "Press Enter after installing Docker Desktop..."
      ;;
    *)
      echo "✗ Cannot auto-install Docker"
      echo "  Install from: https://docs.docker.com/engine/install/"
      exit 1
      ;;
  esac
}

# Function to install Python venv with faster-whisper
install_whisper() {
  echo ""
  echo "📦 Installing faster-whisper for local STT..."
  
  # Check Python
  if ! command -v python3 &> /dev/null; then
    echo "📦 Installing Python..."
    case "$PKG_MANAGER" in
      apt)
        sudo apt-get install -y python3 python3-venv python3-pip
        ;;
      dnf)
        sudo dnf install -y python3 python3-venv python3-pip
        ;;
      pacman)
        sudo pacman -S --noconfirm python python-virtualenv python-pip
        ;;
      brew)
        brew install python
        ;;
    esac
  fi
  
  # Create venv and install faster-whisper
  OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
  mkdir -p "$OPENCLAW_DIR"
  
  if [ ! -d "$OPENCLAW_DIR/whisper-venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$OPENCLAW_DIR/whisper-venv"
  fi
  
  echo "Installing faster-whisper..."
  "$OPENCLAW_DIR/whisper-venv/bin/pip" install --upgrade pip
  "$OPENCLAW_DIR/whisper-venv/bin/pip" install faster-whisper
  
  echo "✓ faster-whisper installed"
}

# Function to install git
install_git() {
  echo ""
  echo "📦 Installing git..."
  case "$PKG_MANAGER" in
    apt)
      sudo apt-get update && sudo apt-get install -y git
      ;;
    dnf)
      sudo dnf install -y git
      ;;
    pacman)
      sudo pacman -S --noconfirm git
      ;;
    brew)
      brew install git
      ;;
    *)
      echo "✗ Cannot auto-install git"
      exit 1
      ;;
  esac
  echo "✓ Git installed"
}

echo ""
echo "Checking prerequisites..."
echo ""

# Check git
if ! command -v git &> /dev/null; then
  echo "✗ Git not found"
  read -p "  Install git? (Y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    install_git
  else
    exit 1
  fi
else
  echo "✓ Git installed"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "✗ Node.js not found"
  read -p "  Install Node.js? (Y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    install_nodejs
  else
    exit 1
  fi
else
  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    echo "✗ Node.js 18+ required (found v$NODE_VERSION)"
    read -p "  Upgrade Node.js? (Y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
      install_nodejs
    else
      exit 1
    fi
  else
    echo "✓ Node.js $(node -v)"
  fi
fi

# Check for Podman or Docker (prefer Podman)
if ! command -v podman &> /dev/null && ! command -v docker &> /dev/null; then
  echo "✗ Container runtime not found"
  read -p "  Install Podman? (Y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    install_podman
  else
    echo "  Install Podman: https://podman.io/"
    exit 1
  fi
else
  if command -v podman &> /dev/null; then
    echo "✓ Podman installed"
  else
    echo "✓ Docker installed"
  fi
fi

# Check Docker permissions (Linux only)
if [ "$OS" = "Linux" ] && command -v docker &> /dev/null; then
  if ! docker info &> /dev/null 2>&1; then
    echo "⚠️  Docker permission issue"
    echo "  Run: sudo usermod -aG docker $USER && newgrp docker"
  fi
fi

echo ""
echo "Cloning repository..."

# Remove old install if exists
if [ -d "$INSTALL_DIR" ]; then
  echo "Removing old installation..."
  rm -rf "$INSTALL_DIR"
fi

# Clone fresh
git clone "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo ""
echo "Installing dependencies..."
cd "$INSTALL_DIR/cli"
npm install --silent --production

# Install API server dependencies
cd "$INSTALL_DIR/openclaw-api-server"
npm install --silent --production

# Install faster-whisper
install_whisper

# Create symlink
echo ""
if [ -L "$BIN_DIR/claude-phone" ]; then
  rm "$BIN_DIR/claude-phone"
fi

if [ "$OS" = "Linux" ]; then
  ln -s "$INSTALL_DIR/cli/bin/claude-phone.js" "$BIN_DIR/claude-phone"
  echo "✓ Installed to: $BIN_DIR/claude-phone"
  
  if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo ""
    echo "⚠️  Adding $HOME/.local/bin to PATH..."
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    export PATH="$HOME/.local/bin:$PATH"
  fi
else
  if [ -w "$BIN_DIR" ]; then
    ln -s "$INSTALL_DIR/cli/bin/claude-phone.js" "$BIN_DIR/claude-phone"
  else
    sudo ln -s "$INSTALL_DIR/cli/bin/claude-phone.js" "$BIN_DIR/claude-phone"
  fi
  echo "✓ Installed to: $BIN_DIR/claude-phone"
fi

echo ""
echo "════════════════════════════════════════════"
echo "✓ OpenClaw Phone Installation Complete!"
echo "════════════════════════════════════════════"
echo ""
echo "Free services configured:"
echo "  ✓ Edge TTS (Microsoft) - free TTS"
echo "  ✓ Local Whisper - free STT"
echo "  ✓ OpenClaw - free AI agent"
echo ""
echo "Next steps:"
echo "  cd $INSTALL_DIR"
echo "  claude-phone setup    # Configure 3CX settings"
echo "  ./start-openclaw.sh   # Launch services"
echo ""
echo "Or manually:"
echo "  cd $INSTALL_DIR/openclaw-api-server && node server.js"
echo "  cd $INSTALL_DIR && podman-compose up -d"
echo ""
echo "Test with:"
echo "  curl -X POST http://localhost:3333/ask \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"prompt\": \"Hello!\"}'"
echo ""