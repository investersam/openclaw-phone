/**
 * Conversation Loop for ESL (FreeSWITCH Event Socket Library)
 * ESL-compatible version that works with Kamailio + FreeSWITCH
 *
 * Features:
 * - VAD-based speech detection
 * - DTMF # key to end speech early
 * - Whisper transcription
 * - OpenClaw API integration
 * - Edge TTS response generation
 * - Turn-taking audio cues (beeps)
 * - Hold music during processing
 */

const logger = require('./logger');

// Audio cue URLs
const READY_BEEP_URL = 'http://127.0.0.1:3000/static/ready-beep.wav';
const GOTIT_BEEP_URL = 'http://127.0.0.1:3000/static/gotit-beep.wav';
const HOLD_MUSIC_URL = 'http://127.0.0.1:3000/static/hold-music.mp3';

// Claude Code-style thinking phrases
const THINKING_PHRASES = [
  "Pondering...",
  "Elucidating...",
  "Cogitating...",
  "Ruminating...",
  "Contemplating...",
  "Consulting the oracle...",
  "Summoning knowledge...",
  "Engaging neural pathways...",
  "Accessing the mainframe...",
  "Querying the void...",
  "Let me think about that...",
  "Processing...",
  "Hmm, interesting question...",
  "One moment...",
  "Searching my brain...",
];

function getRandomThinkingPhrase() {
  return THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
}

function isGoodbye(transcript) {
  const lower = transcript.toLowerCase().trim();
  const goodbyePhrases = ['goodbye', 'good bye', 'bye', 'hang up', 'end call', "that's all", 'thats all'];
  return goodbyePhrases.some(phrase => {
    return lower === phrase || lower.includes(` ${phrase}`) ||
           lower.startsWith(`${phrase} `) || lower.endsWith(` ${phrase}`);
  });
}

/**
 * Clean markdown and formatting from text for speech
 */
function cleanForSpeech(text) {
  return text
    .replace(/\*+/g, '')              // Remove bold/italic markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Convert [text](url) to just text
    .replace(/\[([^\]]+)\]/g, '$1')   // Remove remaining brackets
    .trim();
}

/**
 * Extract voice-friendly line from Claude's response
 * Priority: VOICE_RESPONSE > CUSTOM COMPLETED > COMPLETED > first sentence
 */
function extractVoiceLine(response) {
  // Priority 1: Check for new VOICE_RESPONSE line (voice-optimized content)
  const voiceMatch = response.match(/🗣️\s*VOICE_RESPONSE:\s*([^\n]+)/im);
  if (voiceMatch) {
    const text = cleanForSpeech(voiceMatch[1]);
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

    // Accept if under 60 words
    if (text && wordCount <= 60) {
      return text;
    }

    // If too long, log warning but continue to next fallback
    logger.warn('VOICE_RESPONSE too long, falling back', { wordCount, maxWords: 60 });
  }

  // Priority 2: Check for legacy CUSTOM COMPLETED line
  const customMatch = response.match(/🗣️\s*CUSTOM\s+COMPLETED:\s*(.+?)(?:\n|$)/im);
  if (customMatch) {
    const text = cleanForSpeech(customMatch[1]);
    if (text && text.split(/\s+/).length <= 50) {
      return text;
    }
  }

  // Priority 3: Check for standard COMPLETED line
  const completedMatch = response.match(/🎯\s*COMPLETED:\s*(.+?)(?:\n|$)/im);
  if (completedMatch) {
    return cleanForSpeech(completedMatch[1]);
  }

  // Priority 4: Fallback to first sentence
  const firstSentence = response.split(/[.!?]/)[0];
  if (firstSentence && firstSentence.length < 500) {
    return firstSentence.trim();
  }

  // Last resort: truncate
  return response.substring(0, 500).trim();
}

/**
 * Run the conversation loop using ESL
 *
 * @param {Object} call - ESL Call object with uuid
 * @param {Object} audioForkServer - WebSocket audio fork server
 * @param {Object} options - Configuration options
 * @returns {Promise<void>}
 */
async function runConversationLoopESL(call, audioForkServer, options) {
  const {
    whisperClient,
    claudeBridge,
    ttsService,
    wsPort,
    initialContext = null,
    skipGreeting = false,
    deviceConfig = null,
    maxTurns = 20
  } = options;

  const callUuid = call.uuid;
  const devicePrompt = deviceConfig?.prompt || null;
  const voiceId = deviceConfig?.voiceId || null;

  let session = null;
  let forkRunning = false;
  let callActive = true;
  let dtmfBuffer = '';

  // Set up call end detection
  const onCallDestroy = () => {
    callActive = false;
    logger.info('Call ended', { callUuid });
  };

  call.on('destroy', onCallDestroy);

  // Set up DTMF handler
  const onDTMF = (digit) => {
    dtmfBuffer += digit;
    logger.info('DTMF received', { callUuid, digit });

    if (digit === '#' && session) {
      logger.info('DTMF # pressed - forcing utterance finalization', { callUuid });
      session.forceFinalize();
    }
  };

  call.on('dtmf', onDTMF);

  try {
    logger.info('Conversation loop starting (ESL)', {
      callUuid,
      skipGreeting,
      hasInitialContext: !!initialContext
    });

    // Play greeting
    if (!skipGreeting && callActive) {
      const greeting = deviceConfig
        ? `Hello! I'm ${deviceConfig.name}. How can I help you today?`
        : "Hello! I'm your server. How can I help you today?";

      const greetingUrl = await ttsService.generateSpeech(greeting, voiceId);
      await call.play(greetingUrl);
    }

    // Prime OpenClaw with context for outbound calls
    if (initialContext && callActive) {
      logger.info('Priming OpenClaw with outbound context', { callUuid });
      claudeBridge.query(
        `[SYSTEM CONTEXT]: You just called the user to tell them: "${initialContext}". They have answered.`,
        { callId: callUuid, devicePrompt }
      ).catch(err => logger.warn('Prime query failed', { callUuid, error: err.message }));
    }

    if (!callActive) return;

    // Start audio fork
    const wsUrl = `ws://127.0.0.1:${wsPort}/${encodeURIComponent(callUuid)}`;
    const sessionPromise = audioForkServer.expectSession(callUuid, { timeoutMs: 10000 });

    await call.forkAudio(wsUrl);
    forkRunning = true;

    try {
      session = await sessionPromise;
      logger.info('Audio fork connected', { callUuid });
    } catch (err) {
      logger.warn('Audio fork session failed', { callUuid, error: err.message });
      audioForkServer.cancelExpectation?.(callUuid);
      return;
    }

    // Main conversation loop
    let turnCount = 0;

    while (turnCount < maxTurns && callActive) {
      turnCount++;
      logger.info('Conversation turn', { callUuid, turn: turnCount, maxTurns });

      if (!callActive) break;

      // READY BEEP
      try {
        if (callActive) await call.play(READY_BEEP_URL);
      } catch (e) {
        if (!callActive) break;
        logger.warn('Ready beep failed', { callUuid, error: e.message });
      }

      // Wait for speech
      session.setCaptureEnabled(true);
      dtmfBuffer = ''; // Reset DTMF buffer
      logger.info('Waiting for speech (press # to send)', { callUuid });

      let utterance = null;
      try {
        utterance = await session.waitForUtterance({ timeoutMs: 30000 });
        logger.info('Got utterance', {
          callUuid,
          bytes: utterance.audio?.length,
          reason: utterance.reason
        });
      } catch (err) {
        if (!callActive) break;
        logger.info('Utterance timeout', { callUuid, error: err.message });
      }

      session.setCaptureEnabled(false);

      if (!callActive) break;

      // No speech heard
      if (!utterance) {
        const promptUrl = await ttsService.generateSpeech(
          "I didn't hear anything. Are you still there?",
          voiceId
        );
        if (callActive) await call.play(promptUrl);
        continue;
      }

      // GOT-IT BEEP
      try {
        if (callActive) await call.play(GOTIT_BEEP_URL);
      } catch (e) {
        if (!callActive) break;
        logger.warn('Got-it beep failed', { callUuid, error: e.message });
      }

      // Transcribe
      const transcript = await whisperClient.transcribe(utterance.audio, {
        format: 'pcm',
        sampleRate: 16000
      });

      logger.info('Transcribed', { callUuid, transcript });

      if (!transcript || transcript.trim().length < 2) {
        const clarifyUrl = await ttsService.generateSpeech(
          "Sorry, I didn't catch that. Could you repeat?",
          voiceId
        );
        if (callActive) await call.play(clarifyUrl);
        continue;
      }

      // Check for goodbye
      if (isGoodbye(transcript)) {
        const byeUrl = await ttsService.generateSpeech("Goodbye! Call again anytime.", voiceId);
        if (callActive) await call.play(byeUrl);
        break;
      }

      if (!callActive) break;

      // THINKING FEEDBACK
      const thinkingPhrase = getRandomThinkingPhrase();
      logger.info('Playing thinking phrase', { callUuid, phrase: thinkingPhrase });
      const thinkingUrl = await ttsService.generateSpeech(thinkingPhrase, voiceId);
      if (callActive) await call.play(thinkingUrl);

      // Hold music in background
      let musicPlaying = false;
      if (callActive) {
        call.play(HOLD_MUSIC_URL).catch(e => {
          logger.warn('Hold music failed', { callUuid, error: e.message });
        });
        musicPlaying = true;
      }

      // Query OpenClaw
      logger.info('Querying OpenClaw', { callUuid });
      const claudeResponse = await claudeBridge.query(
        transcript,
        { callId: callUuid, devicePrompt }
      );

      // Stop hold music
      if (musicPlaying && callActive) {
        try {
          await call.stopPlayback();
        } catch (e) {
          // Ignore
        }
      }

      if (!callActive) break;

      logger.info('OpenClaw responded', { callUuid });

      // Play response
      const voiceLine = extractVoiceLine(claudeResponse);
      logger.info('Voice line', { callUuid, voiceLine });

      const responseUrl = await ttsService.generateSpeech(voiceLine, voiceId);
      if (callActive) await call.play(responseUrl);

      logger.info('Turn complete', { callUuid, turn: turnCount });
    }

    // Max turns reached
    if (turnCount >= maxTurns && callActive) {
      const maxUrl = await ttsService.generateSpeech(
        "We've been talking for a while. Goodbye!",
        voiceId
      );
      await call.play(maxUrl);
    }

    logger.info('Conversation loop ended', { callUuid, turns: turnCount });

  } catch (error) {
    logger.error('Conversation loop error', {
      callUuid,
      error: error.message,
      stack: error.stack
    });

    try {
      if (session) session.setCaptureEnabled(false);
      if (callActive) {
        const errUrl = await ttsService.generateSpeech("Sorry, something went wrong.", voiceId);
        await call.play(errUrl);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  } finally {
    logger.info('Conversation loop cleanup', { callUuid });

    // Remove listeners
    call.off('destroy', onCallDestroy);
    call.off('dtmf', onDTMF);

    // Cancel pending expectations
    if (audioForkServer.cancelExpectation) {
      audioForkServer.cancelExpectation(callUuid);
    }

    // End session
    try {
      await claudeBridge.endSession(callUuid);
    } catch (e) {
      // Ignore
    }

    // Stop audio fork
    if (forkRunning) {
      try {
        await call.stopForkAudio();
      } catch (e) {
        // Ignore
      }
    }
  }
}

module.exports = {
  runConversationLoopESL,
  extractVoiceLine,
  isGoodbye,
  getRandomThinkingPhrase,
  cleanForSpeech,
  READY_BEEP_URL,
  GOTIT_BEEP_URL,
  HOLD_MUSIC_URL
};
