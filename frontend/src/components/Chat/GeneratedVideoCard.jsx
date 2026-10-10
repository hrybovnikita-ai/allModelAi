import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { downloadVideo, resolveVideoPlaybackUrl } from '../../lib/videoGeneration';

export default function GeneratedVideoCard({ message, onDownloadError, onRegenerate }) {
  const [playbackSrc, setPlaybackSrc] = useState('');
  const rawUrl = message?.videoUrl;

  useEffect(() => {
    if (!rawUrl) {
      setPlaybackSrc('');
      return undefined;
    }
    const resolved = resolveVideoPlaybackUrl(rawUrl);
    if (!String(rawUrl).startsWith('/api/')) {
      setPlaybackSrc(resolved);
      return undefined;
    }
    let blobUrl = '';
    let cancelled = false;
    void apiFetch(rawUrl)
      .then((response) => {
        if (!response.ok) throw new Error('playback failed');
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(blob);
        setPlaybackSrc(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setPlaybackSrc(resolved);
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [rawUrl]);

  if (!rawUrl) return null;

  return (
    <div className="generated-video-result">
      <video
        className="generated-video"
        src={playbackSrc || resolveVideoPlaybackUrl(rawUrl)}
        controls
        playsInline
        preload="metadata"
        aria-label="Generated video"
      />
      {(message.videoAspect || message.videoResolution) && (
        <div className="generated-image-meta">
          {message.videoAspect && <span>{message.videoAspect}</span>}
          {message.videoResolution && <span>{message.videoResolution}</span>}
          {message.videoModel && <span>{message.videoModel}</span>}
        </div>
      )}
      <div className="generated-image-actions">
        <button
          type="button"
          onClick={() => downloadVideo(rawUrl).catch(() => onDownloadError?.('Could not download the video.'))}
        >
          Download video
        </button>
        {onRegenerate && (
          <button type="button" onClick={onRegenerate}>
            Regenerate
          </button>
        )}
      </div>
    </div>
  );
}
