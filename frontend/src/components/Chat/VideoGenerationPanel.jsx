import { useMemo } from 'react';
import {
  VIDEO_ASPECTS,
  resolveVideoUiOptions,
} from '../../lib/videoGeneration';

const PROVIDER_OPTIONS = [
  { id: '', label: 'Auto (server preference)' },
  { id: 'magichour', label: 'Magic Hour' },
  { id: 'gemini', label: 'Gemini Veo' },
];

export default function VideoGenerationPanel({
  prompt = '',
  onPromptChange,
  mode = 'text-to-video',
  onModeChange,
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  durationSeconds,
  onDurationChange,
  provider = '',
  onProviderChange,
  referenceImageUrl = '',
  onReferenceImageChange,
  useLastImage = false,
  onUseLastImageChange,
  lastAssistantImageUrl = '',
  providerStatus = null,
  activeJobs = [],
  pendingJobId = '',
  busy = false,
  onGenerate,
  onResumeJob,
}) {
  const resumeJobId = activeJobs[0]?.jobId || pendingJobId;
  const mh = providerStatus?.providers?.magichour;
  const magichourKeyRejected = mh?.authProbe?.ok === false && mh?.authProbe?.keyConfigured;
  const magichourReady = Boolean(mh?.ready || (mh?.configured && !magichourKeyRejected));
  const geminiReady = providerStatus?.providers?.gemini?.configured;
  const showProviderPicker = (magichourReady || magichourKeyRejected) && geminiReady;
  const blockMagicHourGenerate = magichourKeyRejected
    && (!provider || provider === 'magichour');

  const { resolutions, durations } = useMemo(
    () => resolveVideoUiOptions(providerStatus),
    [providerStatus],
  );

  return (
    <div className="video-gen-panel" aria-label="AI video generation">
      <div className="video-gen-panel__header">
        <span className="video-gen-panel__badge">Make video</span>
        <p className="video-gen-panel__lead">Text-to-video and image-to-video via your configured backend provider.</p>
      </div>

      <label className="video-gen-panel__field">
        <span>Prompt</span>
        <textarea
          rows={3}
          value={prompt}
          onChange={(event) => onPromptChange?.(event.target.value)}
          placeholder="Describe motion, camera, mood, and subject…"
          disabled={busy}
        />
      </label>

      <div className="video-gen-panel__modes" role="radiogroup" aria-label="Video mode">
        <button
          type="button"
          className={mode === 'text-to-video' ? 'is-active' : ''}
          onClick={() => onModeChange?.('text-to-video')}
          disabled={busy}
        >
          Text to video
        </button>
        <button
          type="button"
          className={mode === 'image-to-video' ? 'is-active' : ''}
          onClick={() => onModeChange?.('image-to-video')}
          disabled={busy}
        >
          Image to video
        </button>
      </div>

      {mode === 'image-to-video' && (
        <div className="video-gen-panel__image">
          {lastAssistantImageUrl && (
            <label className="video-skill-checkbox">
              <input
                type="checkbox"
                checked={useLastImage}
                onChange={(event) => onUseLastImageChange?.(event.target.checked)}
                disabled={busy}
              />
              Use last generated image
            </label>
          )}
          <label className="video-gen-panel__field">
            <span>Reference image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || useLastImage}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  onReferenceImageChange?.('');
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => onReferenceImageChange?.(String(reader.result || ''));
                reader.readAsDataURL(file);
              }}
            />
          </label>
          {(referenceImageUrl || (useLastImage && lastAssistantImageUrl)) && (
            <img
              className="video-gen-panel__thumb"
              src={useLastImage ? lastAssistantImageUrl : referenceImageUrl}
              alt="Reference for image-to-video"
            />
          )}
        </div>
      )}

      <div className="video-gen-panel__grid">
        <label>
          Aspect ratio
          <select value={aspectRatio} onChange={(e) => onAspectRatioChange?.(e.target.value)} disabled={busy}>
            {VIDEO_ASPECTS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          Resolution
          <select value={resolution} onChange={(e) => onResolutionChange?.(e.target.value)} disabled={busy}>
            {resolutions.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          Duration
          <select
            value={durationSeconds}
            onChange={(e) => onDurationChange?.(Number(e.target.value))}
            disabled={busy}
          >
            {durations.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        {showProviderPicker && (
          <label>
            Provider
            <select value={provider} onChange={(e) => onProviderChange?.(e.target.value)} disabled={busy}>
              {PROVIDER_OPTIONS.filter((item) => item.id !== 'gemini' || geminiReady)
                .filter((item) => item.id !== 'magichour' || magichourReady)
                .map((item) => (
                  <option key={item.id || 'auto'} value={item.id}>{item.label}</option>
                ))}
            </select>
          </label>
        )}
      </div>

      {providerStatus && (
        <p className="video-skill-hint">
          Provider:{' '}
          {providerStatus.activeProvider || 'none'}
          {magichourReady ? ' · Magic Hour' : ''}
          {geminiReady ? ' · Gemini Veo' : ''}
          {providerStatus.configured === false
            ? ' · add MAGIC_HOUR_API_KEY or GEMINI_API_KEY on the server'
            : magichourKeyRejected
              ? ' · Magic Hour key is set but rejected — put your Developer Hub key in MAGIC_HOUR_API_KEY (or AllModelAi_API_KEY_VIDEO), restart backend'
              : mh?.activeKeySource && mh.activeKeySource !== 'MAGIC_HOUR_API_KEY'
                ? ` · using ${mh.activeKeySource} (primary MAGIC_HOUR_API_KEY was rejected)`
                : ''}
          {providerStatus.configured !== false && !magichourKeyRejected && mh?.creditsRemaining != null
            ? ` · Magic Hour API credits: ${mh.creditsRemaining}`
            : providerStatus.configured !== false && !magichourKeyRejected
              ? ' · billable API credits apply'
              : ''}
        </p>
      )}

      {resumeJobId && (
        <button
          type="button"
          className="video-gen-panel__resume"
          disabled={busy}
          onClick={() => onResumeJob?.(resumeJobId)}
        >
          Resume video job
        </button>
      )}
      {activeJobs.length > 0 && (
        <p className="video-skill-hint" role="status">
          {activeJobs.length} video job{activeJobs.length > 1 ? 's' : ''} in progress on the server.
          {activeJobs[0]?.providerProjectId ? ' Magic Hour is processing.' : ' Waiting to submit to Magic Hour.'}
        </p>
      )}
      <button
        type="button"
        className="video-gen-panel__generate"
        disabled={busy || !String(prompt || '').trim() || blockMagicHourGenerate || activeJobs.length > 0}
        onClick={() => onGenerate?.()}
      >
        {busy ? 'Generating…' : 'Generate video'}
      </button>
    </div>
  );
}
