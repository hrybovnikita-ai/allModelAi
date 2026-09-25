import { useState } from 'react';
import {
  ASPECT_LABELS,
  downloadOriginalImage,
  QUALITY_LABELS,
  requestImageUpscale,
} from '../../lib/imageGeneration';
import { checkChatResponse } from '../../lib/api';

export default function GeneratedImageCard({
  message,
  onPreview,
  onDownloadError,
  onRegenerate,
  onUpscaleComplete,
  showUpscale = false,
}) {
  const [upscaling, setUpscaling] = useState(false);

  const upscaleImage = async () => {
    if (!message.imageUrl || upscaling) return;
    setUpscaling(true);
    try {
      const response = await requestImageUpscale(message.imageUrl);
      await checkChatResponse(response);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.message || 'Could not upscale the image.');
      }
      onUpscaleComplete?.({
        imageUrl: result.imageUrl,
        imageMimeType: result.mimeType || message.imageMimeType,
        upscaled: true,
      });
    } catch (failure) {
      onDownloadError(failure.message || 'Could not upscale the image.');
    } finally {
      setUpscaling(false);
    }
  };

  return (
    <div className="generated-image-result">
      <button
        type="button"
        className="generated-image-preview"
        onClick={() => onPreview(message.imageUrl)}
        aria-label="Open image"
      >
        <img className="generated-image" src={message.imageUrl} alt="Generated image" />
      </button>
      {(message.imageQuality || message.imageAspect || message.imageSize) && (
        <div className="generated-image-meta">
          {message.imageQuality && (
            <span>{QUALITY_LABELS[message.imageQuality] || message.imageQuality}</span>
          )}
          {message.imageAspect && (
            <span>{ASPECT_LABELS[message.imageAspect] || message.imageAspect}</span>
          )}
          {message.imageSize && <span>{String(message.imageSize).replace('x', '×')}</span>}
          {message.upscaled && <span>Upscaled</span>}
        </div>
      )}
      <div className="generated-image-actions">
        <button
          type="button"
          onClick={() => downloadOriginalImage(message.imageUrl, { mimeType: message.imageMimeType }).catch(() => onDownloadError('Could not download the original image.'))}
        >
          Download image
        </button>
        <button type="button" onClick={onRegenerate}>Regenerate</button>
        {showUpscale && (
          <button type="button" disabled={upscaling} onClick={upscaleImage}>
            {upscaling ? 'Upscaling…' : 'Upscale image'}
          </button>
        )}
      </div>
    </div>
  );
}
