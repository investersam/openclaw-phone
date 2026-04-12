#!/usr/bin/env python3
"""
Whisper Transcription Script
Uses faster-whisper for local speech-to-text (free alternative to OpenAI Whisper API)

Usage:
    python whisper-transcribe.py <audio_file> [--language en] [--model medium]

Environment:
    Optionally set OPENCLAW_DIR to point to your OpenClaw directory
    (defaults to ~/.openclaw)
"""

import sys
import os
import argparse
import torch

# Add OpenClaw dir to path for faster-whisper venv
openclaw_dir = os.environ.get('OPENCLAW_DIR', os.path.expanduser('~/.openclaw'))
venv_python = os.path.join(openclaw_dir, 'whisper-venv', 'bin', 'python')

# Check if we're in the venv or need to use it
def setup_whisper():
    """Import and configure faster-whisper"""
    try:
        from faster_whisper import WhisperModel
        return WhisperModel
    except ImportError:
        print("ERROR: faster-whisper not installed", file=sys.stderr)
        print("Install with: pip install faster-whisper", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='Transcribe audio using faster-whisper')
    parser.add_argument('audio_file', help='Path to audio file (WAV format)')
    parser.add_argument('--language', default='en', help='Language code (default: en)')
    parser.add_argument('--model', default='medium', help='Model size: tiny, base, small, medium, large')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.audio_file):
        print(f"ERROR: Audio file not found: {args.audio_file}", file=sys.stderr)
        sys.exit(1)
    
    print(f"Loading faster-whisper model: {args.model}")
    
    # Check for GPU
    if torch.cuda.is_available():
        print("GPU available, using CUDA")
        compute_type = "float16"
    else:
        print("GPU not available, falling back to CPU")
        compute_type = "int8"
    
    # Load model
    WhisperModel = setup_whisper()
    model = WhisperModel(args.model, compute_type=compute_type)
    
    print(f"Transcribing: {args.audio_file}")
    
    # Transcribe
    segments, info = model.transcribe(args.audio_file, language=args.language)
    
    print(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")
    
    # Collect all segments
    result = []
    for segment in segments:
        result.append(segment.text.strip())
    
    final_text = ' '.join(result)
    print(final_text)

if __name__ == '__main__':
    main()