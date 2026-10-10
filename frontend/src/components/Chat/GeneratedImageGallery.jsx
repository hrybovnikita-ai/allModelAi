import { useState } from 'react';
import {
  ASPECT_LABELS,
  downloadOriginalImage,
  QUALITY_LABELS,
  requestImageUpscale,
} from '../../lib/imageGeneration';
import { checkChatResponse } from '../../lib/api';

export default function GeneratedImageGallery({
  message,
  onPreview,
  onDownloadError,
  onRegenerate,
  onUpscaleComplete,
  showUpscale = false,
}) {
  const images = (Array.isArray(message.images) && message.images.length
    ? message.images
    : message.imageUrl
      ? [{ imageUrl: message.imageUrl, mimeType: message.imageMimeType }]
      : []);
  const [upscalingIndex, setUpscalingIndex] = useState(null);
  const count = images.length;
  const gridClass = count === 1
    ? 'generated-image-gallery generated-image-gallery--1'
    : count === 2
      ? 'generated-image-gallery generated-image-gallery--2'
      : count === 3
        ? 'generated-image-gallery generated-image-gallery--3'
        : 'generated-image-gallery generated-image-gallery--4';

  const upscaleAt = async (index) => {
    const item = images[index];
    if (!item?.imageUrl || upscalingIndex != null) return;
    setUpscalingIndex(index);
    try {
      const response = await requestImageUpscale(item.imageUrl);
      await checkChatResponse(response);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.imageUrl) {
        throw new Error(result.message || 'Could not upscale the image.');
      }
      onUpscaleComplete?.({
        images: images.map((entry, entryIndex) => (
          entryIndex === index
            ? { ...entry, imageUrl: result.imageUrl, mimeType: result.mimeType || entry.mimeType }
            : entry
        )),
        imageUrl: index === 0 ? result.imageUrl : message.imageUrl,
        imageMimeType: index === 0 ? result.mimeType : message.imageMimeType,
        upscaled: true,
      });
    } catch (failure) {
      onDownloadError(failure.message || 'Could not upscale the image.');
    } finally {
      setUpscalingIndex(null);
    }
  };

  return (
    <div className="generated-image-result generated-image-result--gallery">
      {message.partial && message.imageGenerationWarning && (
        <p className="generated-image-partial" role="status">{message.imageGenerationWarning}</p>
      )}
      <div className={gridClass} data-count={count}>
        {images.map((item, index) => (
          <figure key={`${item.imageUrl.slice(-24)}-${index}`} className="generated-image-gallery__item">
            <button
              type="button"
              className="generated-image-preview"
              onClick={() => onPreview(item.imageUrl)}
              aria-label={`Open image ${index + 1} of ${count}`}
            >
              <img
                className="generated-image"
                src={item.imageUrl}
                alt={`Generated image ${index + 1}`}
                loading="lazy"
              />
            </button>
            <div className="generated-image-actions generated-image-actions--compact">
              <button
                type="button"
                onClick={() => downloadOriginalImage(item.imageUrl, {
                  mimeType: item.mimeType || message.imageMimeType,
                  filename: `allmodelai-image-${index + 1}`,
                }).catch(() => onDownloadError('Could not download the original image.'))}
              >
                Download
              </button>
              {showUpscale && count === 1 && (
                <button type="button" disabled={upscalingIndex != null} onClick={() => upscaleAt(index)}>
                  {upscalingIndex === index ? 'Upscaling…' : 'Upscale'}
                </button>
              )}
            </div>
          </figure>
        ))}
      </div>
      {(message.imageQuality || message.imageAspect || message.imageSize || message.requestedImageCount > 1) && (
        <div className="generated-image-meta">
          {message.imageQuality && (
            <span>{QUALITY_LABELS[message.imageQuality] || message.imageQuality}</span>
          )}
          {message.imageAspect && (
            <span>{ASPECT_LABELS[message.imageAspect] || message.imageAspect}</span>
          )}
          {message.imageSize && <span>{String(message.imageSize).replace('x', '×')}</span>}
          {count > 1 && <span>{count} images</span>}
          {message.upscaled && <span>Upscaled</span>}
        </div>
      )}
      <div className="generated-image-actions">
        <button type="button" onClick={onRegenerate}>Regenerate</button>
      </div>
    </div>
  );
}
