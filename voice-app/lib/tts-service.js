/**
 * Edge TTS Text-to-Speech Service
 * Generates speech audio files using Microsoft's Edge TTS (npx node-edge-tts)
 * Free alternative to ElevenLabs
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

// Default voice for Edge TTS
const DEFAULT_VOICE = 'en-US-GuyNeural';

// Audio output directory (set via setAudioDir)
let audioDir = path.join(__dirname, '../audio-temp');

/**
 * Set the audio output directory
 * @param {string} dir - Absolute path to audio directory
 */
function setAudioDir(dir) {
  audioDir = dir;

  // Create directory if it doesn't exist
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
    logger.info('Created audio directory', { path: audioDir });
  }
}

/**
 * Generate unique filename for audio file
 * @param {string} text - Text being converted
 * @returns {string} Filename (without path)
 */
function generateFilename(text) {
  // Hash text to create unique identifier
  const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 8);
  const timestamp = Date.now();
  return `tts-${timestamp}-${hash}.mp3`;
}

/**
 * Convert text to speech using Edge TTS via npx
 * @param {string} text - Text to convert to speech
 * @param {string} voiceId - Edge TTS voice name (optional, defaults to DEFAULT_VOICE)
 * @returns {Promise<string>} HTTP URL to audio file
 */
async function generateSpeech(text, voiceId = DEFAULT_VOICE) {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    try {
      logger.info('Generating speech with Edge TTS', {
        textLength: text.length,
        voice: voiceId
      });

      // Generate filename
      const filename = generateFilename(text);
      const outputPath = path.join(audioDir, filename);

      // Escape text for command line
      const escapedText = text.replace(/"/g, '\\"');

      // Build the command
      const command = `npx node-edge-tts -t "${escapedText}" -v ${voiceId} -l en-US -f "${outputPath}"`;

      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          const latency = Date.now() - startTime;
          logger.error('Speech generation failed', {
            error: error.message,
            stderr: stderr,
            latency,
            textLength: text?.length
          });
          reject(new Error(`TTS generation failed: ${error.message}`));
          return;
        }

        // Check if file was created
        if (!fs.existsSync(outputPath)) {
          const latency = Date.now() - startTime;
          logger.error('Speech generation failed - no output file', {
            stderr: stderr,
            latency
          });
          reject(new Error('TTS generation failed - no output file created'));
          return;
        }

        const latency = Date.now() - startTime;
        const fileSize = fs.statSync(outputPath).size;

        logger.info('Speech generation successful', {
          filename,
          fileSize,
          latency,
          textLength: text.length
        });

        // Return HTTP URL
        const audioUrl = `http://127.0.0.1:3000/audio-files/${filename}`;
        resolve(audioUrl);
      });

    } catch (error) {
      const latency = Date.now() - startTime;
      logger.error('Speech generation failed', {
        error: error.message,
        latency
      });
      reject(new Error(`TTS generation failed: ${error.message}`));
    }
  });
}

/**
 * Clean up old audio files (older than specified age)
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
function cleanupOldFiles(maxAgeMs = 60 * 60 * 1000) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(audioDir);

    let deletedCount = 0;
    files.forEach(file => {
      if (!file.startsWith('tts-') || !file.endsWith('.mp3')) {
        return;
      }

      const filepath = path.join(audioDir, file);
      const stats = fs.statSync(filepath);
      const age = now - stats.mtimeMs;

      if (age > maxAgeMs) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      logger.info('Cleaned up old audio files', { deletedCount });
    }

  } catch (error) {
    logger.warn('Failed to cleanup old audio files', { error: error.message });
  }
}

/**
 * Get list of available Edge TTS voices
 * Note: Edge TTS has a fixed set of voices - this returns the default
 * @returns {Array} Array of voice objects
 */
async function getAvailableVoices() {
  // Edge TTS has these common voices (and more)
  return [
    { id: 'en-US-GuyNeural', name: 'Guy', language: 'en-US' },
    { id: 'en-US-JennyNeural', name: 'Jenny', language: 'en-US' },
    { id: 'en-US-AriaNeural', name: 'Aria', language: 'en-US' },
    { id: 'en-US-SaraNeural', name: 'Sara', language: 'en-US' },
    { id: 'en-GB-RyanNeural', name: 'Ryan', language: 'en-GB' },
    { id: 'en-GB-SoniaNeural', name: 'Sonia', language: 'en-GB' }
  ];
}

// Initialize audio directory
setAudioDir(audioDir);

// Setup periodic cleanup (every 30 minutes)
setInterval(() => {
  cleanupOldFiles();
}, 30 * 60 * 1000);

module.exports = {
  generateSpeech,
  setAudioDir,
  cleanupOldFiles,
  getAvailableVoices
};