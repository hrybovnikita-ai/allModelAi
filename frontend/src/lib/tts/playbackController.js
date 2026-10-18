import {
  cleanTextForSpeech,
  downloadAudioBlob,
  getCuratedVoices,
  matchBrowserVoice,
  requestCloudSpeech,
  resolveSpeechLanguage,
} from './ttsClient.js';
import { readLocalVoicePreferences } from './voicePreferences.js';

const listeners = new Set();

let state = {
  status: 'idle', // idle | loading | playing | paused
  sourceId: null,
  engine: null,
  error: null,
  progress: 0,
  canDownload: false,
};

let audioEl = null;
let objectUrl = null;
let lastBlob = null;
let lastMime = null;
let abortController = null;

function emit() {
  const snapshot = { ...state };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      /* ignore listener errors */
    }
  });
}

function setState(patch) {
  state = { ...state, ...patch };
  emit();
}

function cleanupAudioElement() {
  if (audioEl) {
    audioEl.ontimeupdate = null;
    audioEl.onended = null;
    audioEl.onerror = null;
    audioEl.onplay = null;
    audioEl.onpause = null;
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load?.();
    audioEl = null;
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function cleanupBrowserSpeech() {
  try {
    globalThis.speechSynthesis?.cancel?.();
  } catch {
    /* ignore */
  }
}

export function stopPlayback() {
  abortController?.abort?.();
  abortController = null;
  cleanupBrowserSpeech();
  cleanupAudioElement();
  setState({
    status: 'idle',
    sourceId: null,
    engine: null,
    error: null,
    progress: 0,
    canDownload: Boolean(lastBlob),
  });
}

export function subscribePlayback(listener) {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

export function getPlaybackState() {
  return { ...state };
}

export function downloadLastAudio(filename) {
  if (!lastBlob) return false;
  const ext = (lastMime || '').includes('wav') ? 'wav' : 'mp3';
  downloadAudioBlob(lastBlob, filename || `allmodelai-voice.${ext}`);
  return true;
}

async function playBrowser({ text, sourceId, prefs, language }) {
  const synth = globalThis.speechSynthesis;
  if (!synth?.speak || !globalThis.SpeechSynthesisUtterance) {
    throw new Error('Browser speech is not available in this browser.');
  }
  cleanupBrowserSpeech();
  lastBlob = null;
  lastMime = null;
  const clean = cleanTextForSpeech(text);
  const profile = getCuratedVoices().find((v) => v.id === prefs.voiceId) || getCuratedVoices()[2];
  const deviceVoices = synth.getVoices?.() || [];
  const voice = matchBrowserVoice(profile, language.code, deviceVoices);
  const next = new globalThis.SpeechSynthesisUtterance(clean);
  next.lang = language.locale;
  next.rate = Math.min(1.5, Math.max(0.7, Number(prefs.speed) || 1));
  if (voice) next.voice = voice;
  next.onstart = () => setState({
    status: 'playing',
    sourceId,
    engine: 'browser',
    error: null,
    progress: 0,
    canDownload: false,
  });
  next.onend = () => setState({
    status: 'idle',
    sourceId: null,
    engine: null,
    error: null,
    progress: 1,
    canDownload: false,
  });
  next.onerror = () => setState({
    status: 'idle',
    sourceId: null,
    engine: null,
    error: 'Speech playback failed.',
    progress: 0,
    canDownload: false,
  });
  synth.speak(next);
}

async function playCloud({ text, sourceId, prefs, language }) {
  abortController = new AbortController();
  setState({
    status: 'loading',
    sourceId,
    engine: null,
    error: null,
    progress: 0.05,
    canDownload: false,
  });
  const result = await requestCloudSpeech({
    text,
    voiceId: prefs.voiceId,
    language: language.code,
    speed: prefs.speed,
    engine: prefs.engine === 'auto' ? undefined : prefs.engine,
    signal: abortController.signal,
  });
  cleanupAudioElement();
  lastBlob = result.blob || null;
  lastMime = result.mimeType || null;
  objectUrl = result.objectUrl;
  audioEl = new Audio(objectUrl);
  // Kokoro already baked speed into the WAV; keep rate at 1 for those.
  // Cloud MP3 may still benefit from playbackRate adjustment.
  const rate = Math.min(1.5, Math.max(0.7, Number(prefs.speed) || 1));
  audioEl.playbackRate = result.engine === 'kokoro' ? 1 : rate;
  audioEl.ontimeupdate = () => {
    if (!audioEl?.duration) return;
    setState({ progress: Math.min(1, audioEl.currentTime / audioEl.duration) });
  };
  audioEl.onended = () => {
    cleanupAudioElement();
    setState({
      status: 'idle',
      sourceId: null,
      engine: null,
      error: null,
      progress: 1,
      canDownload: Boolean(lastBlob),
    });
  };
  audioEl.onerror = () => {
    cleanupAudioElement();
    setState({
      status: 'idle',
      sourceId: null,
      engine: null,
      error: 'Audio playback failed.',
      progress: 0,
      canDownload: Boolean(lastBlob),
    });
  };
  await audioEl.play();
  setState({
    status: 'playing',
    sourceId,
    engine: result.engine,
    error: null,
    progress: 0.1,
    canDownload: Boolean(lastBlob),
  });
}

/**
 * Play text for a given source id (e.g. message index). Stops any other playback first.
 */
export async function playText(text, { sourceId = 'studio', prefs: prefsOverride } = {}) {
  stopPlayback();
  const prefs = { ...readLocalVoicePreferences(), ...prefsOverride };
  const language = resolveSpeechLanguage(prefs, text);
  const clean = cleanTextForSpeech(text);
  if (!clean) return;

  try {
    if (prefs.engine === 'browser') {
      await playBrowser({ text: clean, sourceId, prefs, language });
      return;
    }
    try {
      await playCloud({ text: clean, sourceId, prefs, language });
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (error.fallback === 'browser' || error.code === 'TTS_USE_BROWSER_FALLBACK' || error.status === 503) {
        await playBrowser({ text: clean, sourceId, prefs, language });
        return;
      }
      throw error;
    }
  } catch (error) {
    setState({
      status: 'idle',
      sourceId: null,
      engine: null,
      error: error.message || 'Could not play speech.',
      progress: 0,
      canDownload: Boolean(lastBlob),
    });
  }
}

export function pausePlayback() {
  if (audioEl && !audioEl.paused) {
    audioEl.pause();
    setState({ status: 'paused' });
    return;
  }
  const synth = globalThis.speechSynthesis;
  if (synth && state.status === 'playing' && state.engine === 'browser') {
    synth.pause?.();
    setState({ status: 'paused' });
  }
}

export function resumePlayback() {
  if (audioEl && audioEl.paused) {
    void audioEl.play();
    setState({ status: 'playing' });
    return;
  }
  const synth = globalThis.speechSynthesis;
  if (synth && state.status === 'paused' && state.engine === 'browser') {
    synth.resume?.();
    setState({ status: 'playing' });
  }
}

export function setPlaybackSpeed(speed) {
  const rate = Math.min(1.5, Math.max(0.7, Number(speed) || 1));
  if (audioEl && state.engine !== 'kokoro') audioEl.playbackRate = rate;
}

// Stop when navigating away from chat/studio
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => stopPlayback());
}
