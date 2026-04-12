/**
 * Local Whisper CLI Client for Speech-to-Text
 * Converts audio buffers to text using faster-whisper via Python wrapper
 * Free alternative to OpenAI Whisper API
 */

const { execSync } = require('child_process');
const WaveFile = require("wavefile").WaveFile;
const fs = require("fs");
const path = require("path");

const WHISPER_PY = path.join(__dirname, '..', 'whisper-transcribe.py');

/**
 * Convert L16 PCM buffer to WAV format for Whisper
 * @param {Buffer} pcmBuffer - Raw L16 PCM audio data
 * @param {number} sampleRate - Sample rate (default: 8000 Hz for telephony)
 * @returns {Buffer} WAV file buffer
 */
function pcmToWav(pcmBuffer, sampleRate = 8000) {
  const wav = new WaveFile();

  // Convert Buffer to Int16Array for wavefile library
  const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);

  // Create WAV from raw PCM data
  wav.fromScratch(1, sampleRate, "16", samples);

  return Buffer.from(wav.toBuffer());
}

/**
 * Transcribe audio using local faster-whisper
 * @param {Buffer} audioBuffer - Audio data (either WAV or raw PCM)
 * @param {Object} options - Transcription options
 * @param {string} options.format - Input format: "wav" or "pcm" (default: "pcm")
 * @param {number} options.sampleRate - Sample rate for PCM (default: 8000)
 * @param {string} options.language - Language code (default: "en")
 * @returns {Promise<string>} Transcribed text
 */
async function transcribe(audioBuffer, options = {}) {
  const {
    format = "pcm",
    sampleRate = 8000,
    language = "en"
  } = options;

  // Convert PCM to WAV if needed
  let wavBuffer;
  if (format === "pcm") {
    wavBuffer = pcmToWav(audioBuffer, sampleRate);
  } else {
    wavBuffer = audioBuffer;
  }

  // Write to temp file
  const tempFile = path.join("/tmp", "whisper-" + Date.now() + ".wav");
  fs.writeFileSync(tempFile, wavBuffer);

  let result = "";
  
  try {
    // Use Python wrapper with faster-whisper
    // Looks for venv in: OPENCLAW_DIR/whisper-venv, ~/.openclaw/whisper-venv, or system python
    const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME, '.openclaw');
    let venvPython = path.join(openclawDir, 'whisper-venv', 'bin', 'python');
    
    // Fall back to system python if venv doesn't exist
    if (!fs.existsSync(venvPython)) {
      venvPython = 'python3';
    }
    
    const command = `${venvPython} "${WHISPER_PY}" "${tempFile}" --language ${language} --model medium`;

    console.log(`[WHISPER] Running: ${command}`);

    result = execSync(command, { 
      encoding: 'utf-8',
      timeout: 120000, // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024 // 10MB max output
    });

    const timestamp = new Date().toISOString();
    console.log("[" + timestamp + "] WHISPER Transcribed: " + result.substring(0, 100) + (result.length > 100 ? "..." : ""));

    return result.trim();

  } catch (error) {
    console.error("[WHISPER] Transcription failed:", error.message);
    throw new Error(`Whisper transcription failed: ${error.message}`);
  } finally {
    // Clean up temp files
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Check if faster-whisper is available
 * @returns {boolean} True if Python wrapper is available
 */
function isAvailable() {
  try {
    const openclawDir = process.env.OPENCLAW_DIR || path.join(process.env.HOME, '.openclaw');
    let venvPython = path.join(openclawDir, 'whisper-venv', 'bin', 'python');
    
    // Fall back to system python if venv doesn't exist
    if (!fs.existsSync(venvPython)) {
      venvPython = 'python3';
    }
    
    execSync(`${venvPython} -c "from faster_whisper import WhisperModel"`, { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch (error) {
    console.warn("[WHISPER] faster-whisper not available:", error.message);
    return false;
  }
}

module.exports = {
  transcribe,
  pcmToWav,
  isAvailable
};