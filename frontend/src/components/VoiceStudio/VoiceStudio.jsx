import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import {
  fetchTtsCatalog,
  fetchTtsHealth,
  fetchVoicePreferencesRemote,
  getCuratedVoices,
  mergeTtsCatalogWithHealth,
  saveVoicePreferencesRemote,
} from '../../lib/tts/ttsClient.js';
import {
  downloadLastAudio,
  pausePlayback,
  playText,
  resumePlayback,
  setPlaybackSpeed,
  stopPlayback,
  subscribePlayback,
} from '../../lib/tts/playbackController.js';
import {
  readLocalVoicePreferences,
  writeLocalVoicePreferences,
} from '../../lib/tts/voicePreferences.js';
import './VoiceStudio.css';

const PREVIEW_SAMPLES = {
  en: 'Welcome to AllModelAI. This voice is ready for clear, natural conversation.',
  ru: 'Добро пожаловать в AllModelAI. Этот голос звучит естественно и понятно.',
  uk: 'Ласкаво просимо до AllModelAI. Цей голос звучить природно та зрозуміло.',
};

export default function VoiceStudio() {
  const [catalog, setCatalog] = useState(null);
  const [prefs, setPrefs] = useState(() => readLocalVoicePreferences());
  const [previewText, setPreviewText] = useState(PREVIEW_SAMPLES.en);
  const [playback, setPlayback] = useState({
    status: 'idle',
    error: null,
    engine: null,
    progress: 0,
    canDownload: false,
  });
  const [saveNotice, setSaveNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const voices = catalog?.voices?.length ? catalog.voices : getCuratedVoices();
  const maleVoices = useMemo(() => voices.filter((v) => v.gender === 'male'), [voices]);
  const femaleVoices = useMemo(() => voices.filter((v) => v.gender === 'female'), [voices]);
  const kokoroReady = Boolean(
    catalog?.providers?.kokoro
    || catalog?.kokoro?.available
    || catalog?.kokoro?.ready,
  );
  const selected = voices.find((v) => v.id === prefs.voiceId) || voices[0];

  useEffect(() => subscribePlayback(setPlayback), []);

  useEffect(() => () => stopPlayback(), []);

  useEffect(() => {
    let active = true;
    const dataFallback = () => ({
      voices: getCuratedVoices(),
      providers: { kokoro: false, browser: true },
    });
    const refreshCatalog = async () => {
      const data = await fetchTtsCatalog();
      if (!active) return;
      setCatalog(data);
      try {
        const remote = await fetchVoicePreferencesRemote();
        if (!active || !remote) return;
        const merged = writeLocalVoicePreferences(remote);
        setPrefs(merged);
      } catch {
        /* guest / offline: keep local */
      }
    };
    const refreshHealth = async () => {
      try {
        const health = await fetchTtsHealth();
        if (!active) return;
        setCatalog((current) => mergeTtsCatalogWithHealth(current || dataFallback(), health));
      } catch {
        if (!active) return;
        setCatalog((current) => mergeTtsCatalogWithHealth(current || dataFallback(), {
          providers: { ...(current?.providers || {}), kokoro: false },
          preferredEngine: 'browser',
          kokoro: {
            available: false,
            ready: false,
            error: 'Backend could not reach the Python TTS service.',
          },
        }));
      }
    };
    void refreshCatalog();
    void refreshHealth();
    const timer = globalThis.setInterval(() => {
      void refreshHealth();
    }, 12_000);
    return () => {
      active = false;
      globalThis.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const lang = prefs.language === 'auto' ? 'en' : prefs.language;
    setPreviewText(PREVIEW_SAMPLES[lang] || PREVIEW_SAMPLES.en);
  }, [prefs.language]);

  useEffect(() => {
    setPlaybackSpeed(prefs.speed);
  }, [prefs.speed]);

  const updatePrefs = (patch) => {
    setPrefs((current) => writeLocalVoicePreferences({ ...current, ...patch }));
    setSaveNotice('');
  };

  const selectVoice = (voice) => {
    const patch = { voiceId: voice.id, style: voice.style };
    if (voice.engine === 'kokoro' || voice.provider === 'kokoro') {
      patch.engine = prefs.engine === 'browser' ? 'browser' : 'auto';
    }
    updatePrefs(patch);
  };

  const handlePreview = async (voiceId) => {
    const next = writeLocalVoicePreferences({ ...prefs, voiceId });
    setPrefs(next);
    await playText(previewText, { sourceId: `preview-${voiceId}`, prefs: next });
  };

  const handlePlay = async () => {
    if (playback.status === 'paused') {
      resumePlayback();
      return;
    }
    await playText(previewText, { sourceId: 'voice-studio', prefs });
  };

  const handleDownload = () => {
    const safeId = String(prefs.voiceId || 'voice').replace(/[^\w.-]+/g, '_');
    downloadLastAudio(`allmodelai-${safeId}.wav`);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveNotice('');
    try {
      const saved = await saveVoicePreferencesRemote(prefs);
      writeLocalVoicePreferences(saved);
      setPrefs(saved);
      setSaveNotice('Preferences saved to your account.');
    } catch {
      writeLocalVoicePreferences(prefs);
      setSaveNotice('Saved on this device. Sign in to sync across devices.');
    } finally {
      setSaving(false);
    }
  };

  const bars = Array.from({ length: 28 }, (_, index) => index);
  const isActive = playback.status === 'playing' || playback.status === 'loading';
  const progressPct = Math.round(Math.min(1, Math.max(0, Number(playback.progress) || 0)) * 100);

  return (
    <main className="voice-studio">
      <div className="voice-studio-shell">
        <header className="voice-studio-hero">
          <AllModelAILogoMark size={52} />
          <div>
            <p className="voice-studio-eyebrow">Voice Studio</p>
            <h1>Natural male and female AI voices</h1>
            <p>
              Preview Kokoro local voices, adjust speed, then use the speaker button on any chat response.
              Free browser speech is always available as a fallback — paid engines stay optional.
            </p>
          </div>
        </header>

        <div className="voice-studio-grid">
          <section className="voice-studio-card" aria-label="Voice library">
            <h2>Choose a voice</h2>
            <p className="voice-provider-inline">
              {kokoroReady
                ? 'Kokoro Online — realistic local voices ready.'
                : (catalog?.kokoro?.error
                  || catalog?.notes?.kokoro
                  || 'Kokoro offline — start the Python AI service on AI_PYTHON_PORT, or use browser voices.')}
            </p>

            <div className="voice-gender-block">
              <p className="voice-gender-title">Male</p>
              <div className="voice-card-grid">
                {maleVoices.map((voice) => (
                  <button
                    key={voice.id}
                    type="button"
                    className={`voice-option${prefs.voiceId === voice.id ? ' is-selected' : ''}`}
                    onClick={() => selectVoice(voice)}
                    aria-pressed={prefs.voiceId === voice.id}
                  >
                    <strong>{voice.label}</strong>
                    <span>{voice.description}</span>
                    <div className="voice-option-actions">
                      {(voice.engine === 'kokoro' || voice.provider === 'kokoro') && (
                        <span className="voice-badge">Kokoro</span>
                      )}
                      <span
                        className="voice-chip-btn"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePreview(voice.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            void handlePreview(voice.id);
                          }
                        }}
                      >
                        Preview
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="voice-gender-block">
              <p className="voice-gender-title">Female</p>
              <div className="voice-card-grid">
                {femaleVoices.map((voice) => (
                  <button
                    key={voice.id}
                    type="button"
                    className={`voice-option${prefs.voiceId === voice.id ? ' is-selected' : ''}`}
                    onClick={() => selectVoice(voice)}
                    aria-pressed={prefs.voiceId === voice.id}
                  >
                    <strong>{voice.label}</strong>
                    <span>{voice.description}</span>
                    <div className="voice-option-actions">
                      {(voice.engine === 'kokoro' || voice.provider === 'kokoro') && (
                        <span className="voice-badge">Kokoro</span>
                      )}
                      <span
                        className="voice-chip-btn"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePreview(voice.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            void handlePreview(voice.id);
                          }
                        }}
                      >
                        Preview
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="voice-studio-card" aria-label="Playback settings">
            <h2>Playback</h2>
            <div
              className={`voice-waveform${isActive ? ' is-active' : ''}`}
              aria-hidden="true"
            >
              {bars.map((bar) => (
                <i key={bar} style={{ height: `${18 + ((bar * 17) % 70)}%` }} />
              ))}
            </div>

            <div
              className="voice-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
              aria-label="Speech generation progress"
            >
              <span style={{ width: `${playback.status === 'loading' ? Math.max(12, progressPct) : progressPct}%` }} />
            </div>

            <div className="voice-controls">
              <label>
                Preview text
                <textarea
                  value={previewText}
                  onChange={(event) => setPreviewText(event.target.value)}
                  maxLength={1200}
                />
              </label>

              <label>
                Language
                <select
                  value={prefs.language}
                  onChange={(event) => updatePrefs({ language: event.target.value })}
                >
                  <option value="auto">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="ru">Русский</option>
                  <option value="uk">Українська</option>
                </select>
              </label>

              <label>
                Speed ({Number(prefs.speed).toFixed(2)}×)
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.05"
                  value={prefs.speed}
                  onChange={(event) => updatePrefs({ speed: Number(event.target.value) })}
                />
              </label>

              <label>
                Engine
                <select
                  value={prefs.engine}
                  onChange={(event) => updatePrefs({ engine: event.target.value })}
                >
                  <option value="auto">Auto (Kokoro → browser)</option>
                  <option value="kokoro" disabled={!kokoroReady}>
                    Kokoro local{kokoroReady ? '' : ' (offline)'}
                  </option>
                  <option value="browser">Browser (free fallback)</option>
                  <option value="openai">OpenAI TTS (paid, optional)</option>
                  <option value="elevenlabs">ElevenLabs (paid, optional)</option>
                </select>
              </label>

              <label className="voice-check">
                <input
                  type="checkbox"
                  checked={Boolean(prefs.autoPlay)}
                  onChange={(event) => updatePrefs({ autoPlay: event.target.checked })}
                />
                Auto-play AI responses in chat
              </label>

              <div className="voice-control-row">
                <button type="button" className="voice-primary-btn" onClick={() => void handlePlay()}>
                  {playback.status === 'loading'
                    ? 'Generating…'
                    : playback.status === 'paused'
                      ? 'Resume'
                      : playback.status === 'playing'
                        ? 'Playing…'
                        : 'Play'}
                </button>
                <button type="button" className="voice-ghost-btn" onClick={() => pausePlayback()}>
                  Pause
                </button>
                <button type="button" className="voice-ghost-btn" onClick={() => stopPlayback()}>
                  Stop
                </button>
              </div>

              <button
                type="button"
                className="voice-ghost-btn voice-download-btn"
                disabled={!playback.canDownload}
                onClick={handleDownload}
              >
                Download WAV
              </button>

              <button type="button" className="voice-primary-btn" disabled={saving} onClick={() => void handleSave()}>
                {saving ? 'Saving…' : 'Save preferences'}
              </button>

              {playback.error ? (
                <p className="voice-status is-error" role="alert">{playback.error}</p>
              ) : (
                <p className="voice-status" role="status">
                  {playback.status === 'loading'
                    ? 'Generating speech…'
                    : playback.engine
                      ? `Engine: ${playback.engine}${selected ? ` · ${selected.label}` : ''}`
                      : 'Ready'}
                  {saveNotice ? ` · ${saveNotice}` : ''}
                </p>
              )}

              <p className="voice-provider-note">
                {catalog?.notes?.kokoro || 'Kokoro runs locally through the Python AI service — no paid API key.'}
                {' '}
                {catalog?.notes?.browser || 'Browser voices remain available without paid keys.'}
                {' '}
                <Link to="/chat">Open chat</Link>
                {' '}
                to read responses aloud.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
