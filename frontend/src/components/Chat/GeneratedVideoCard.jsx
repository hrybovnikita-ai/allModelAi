import { downloadVideo } from '../../lib/videoGeneration';

export default function GeneratedVideoCard({ message, onDownloadError, onRegenerate }) {
  if (!message?.videoUrl) return null;

  return (
    <div className="generated-video-result">
      <video
        className="generated-video"
        src={message.videoUrl}
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
          onClick={() => downloadVideo(message.videoUrl).catch(() => onDownloadError?.('Could not download the video.'))}
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
