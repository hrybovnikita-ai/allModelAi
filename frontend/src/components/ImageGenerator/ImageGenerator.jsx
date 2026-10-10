import { useEffect, useRef, useState } from 'react';
import {
  ASPECT_LABELS,
  buildImageRequestBody,
  downloadOriginalImage,
  fetchImageGenerationStatus,
  IMAGE_ASPECTS,
  IMAGE_COUNT_OPTIONS,
  IMAGE_QUALITIES,
  IMAGE_STYLES,
  imageProviderLabel,
  IMAGE_NOT_CONFIGURED_MESSAGE,
  QUALITY_LABELS,
  requestImageGeneration,
  requestImageUpscale,
} from '../../lib/imageGeneration';
import GeneratedImageGallery from '../Chat/GeneratedImageGallery';
import './ImageGenerator.css';

const formatSize = (size) => (size ? String(size).replace('x', '×') : '');

export default function ImageGenerator({ initialPrompt = '', onClose }) {
  const [prompt, setPrompt] = useState(initialPrompt.slice(0, 4000));
  const [style, setStyle] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [quality, setQuality] = useState('hd');
  const [imageCount, setImageCount] = useState(1);
  const [image, setImage] = useState(null);
  const [generationProgress, setGenerationProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [providerStatus, setProviderStatus] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editInstruction, setEditInstruction] = useState('');
  const originalPromptRef = useRef(initialPrompt.trim().slice(0, 4000));
  const request = useRef(null);
  const dialog = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.showModal();
    fetchImageGenerationStatus().then(setProviderStatus).catch(() => {});
    return () => { request.current?.abort(); previousFocus?.focus(); };
  }, []);

  const runGeneration = async ({ useOriginalPrompt = false, editText = '' } = {}) => {
    if (busy) return;
    const userPrompt = useOriginalPrompt
      ? originalPromptRef.current
      : prompt.trim();
    if (!userPrompt && !editText) return;

    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');

    const body = buildImageRequestBody({
      prompt: editText ? originalPromptRef.current : userPrompt,
      basePrompt: editText ? originalPromptRef.current : '',
      editInstruction: editText,
      style,
      aspectRatio,
      quality,
      count: imageCount,
    });

    try {
      const result = await requestImageGeneration(body, controller.signal, {
        onPoll: ({ progress }) => setGenerationProgress(progress || null),
      });
      if (!result?.imageUrl) throw new Error('The service did not return an image. Please retry.');
      if (!editText && !useOriginalPrompt) {
        originalPromptRef.current = userPrompt;
      }
      setImage(result);
      setGenerationProgress(null);
      setEditOpen(false);
      setEditInstruction('');
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const generate = async (event) => {
    event.preventDefault();
    await runGeneration();
  };

  const regenerate = async () => {
    setPrompt(originalPromptRef.current);
    await runGeneration({ useOriginalPrompt: true });
  };

  const applyEdit = async (event) => {
    event.preventDefault();
    if (!editInstruction.trim()) return;
    await runGeneration({ editText: editInstruction.trim() });
  };

  const downloadImage = async () => {
    if (!image?.imageUrl) return;
    try {
      await downloadOriginalImage(image.imageUrl, { mimeType: image.mimeType });
    } catch (failure) {
      setError(failure.message || 'Could not download the original image.');
    }
  };

  const upscaleImage = async () => {
    if (!image?.imageUrl || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await requestImageUpscale(image.imageUrl, controller.signal);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.imageUrl) throw new Error(result.message || 'Could not upscale the image.');
      setImage((current) => ({
        ...current,
        imageUrl: result.imageUrl,
        mimeType: result.mimeType || current.mimeType,
        upscaled: true,
      }));
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const showUpscale = Boolean(providerStatus?.upscaleSupported || image?.upscaleSupported);
  const aspects = providerStatus?.aspects?.length
    ? IMAGE_ASPECTS.filter((item) => providerStatus.aspects.includes(item.id))
    : IMAGE_ASPECTS;
  const qualities = providerStatus?.qualities?.length
    ? IMAGE_QUALITIES.filter((item) => providerStatus.qualities.includes(item.id))
    : IMAGE_QUALITIES;
  const serverConfigured = providerStatus?.configured !== false;
  const configHint = !serverConfigured && providerStatus?.configuration?.missingEnvVars?.length
    ? `${IMAGE_NOT_CONFIGURED_MESSAGE} Required: ${providerStatus.configuration.missingEnvVars.join('; ')}.`
    : !serverConfigured
      ? IMAGE_NOT_CONFIGURED_MESSAGE
      : '';

  return (
    <dialog ref={dialog} className="image-generator-dialog" aria-labelledby="image-generator-title" onCancel={onClose}>
      <header>
        <div>
          <h2 id="image-generator-title">Create image</h2>
          <p>Describe your image and AI will create it here.</p>
          {imageProviderLabel(providerStatus, quality) && (
            <p className="image-generator-provider">{imageProviderLabel(providerStatus, quality)}</p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close image generator">×</button>
      </header>

      {configHint && (
        <p className="image-generator-config-notice" role="status">{configHint}</p>
      )}

      <form onSubmit={generate}>
        <label htmlFor="image-description">Image description</label>
        <textarea
          id="image-description"
          autoFocus
          rows={3}
          maxLength={4000}
          required
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Example: a golden dragon with purple lightning on a black background"
        />

        <div className="image-generator-count" role="group" aria-label="Number of images">
          {IMAGE_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              className={imageCount === count ? 'is-active' : ''}
              aria-pressed={imageCount === count}
              disabled={busy}
              onClick={() => setImageCount(count)}
            >
              {count === 1 ? '1 image' : `${count} images`}
            </button>
          ))}
        </div>
        {providerStatus?.multiImageBillingNote && imageCount > 1 && (
          <p className="image-generator-billing-note" role="note">{providerStatus.multiImageBillingNote}</p>
        )}
        <div className="image-generator-settings">
          <label>
            Style
            <select value={style} onChange={(event) => setStyle(event.target.value)}>
              {IMAGE_STYLES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)} aria-label="Image format">
              {aspects.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Quality
            <select value={quality} onChange={(event) => setQuality(event.target.value)} aria-label="Quality">
              {qualities.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <button type="submit" className="image-generator-primary" disabled={busy || !prompt.trim() || !serverConfigured}>
          {busy ? 'Creating image…' : 'Generate image'}
        </button>
      </form>

      {busy && (
        <div className="image-generator-loading" role="status" aria-live="polite">
          <span className="image-generator-spinner" aria-hidden="true" />
          <p>
            {generationProgress?.total
              ? `Generated ${generationProgress.completed || 0} of ${generationProgress.total} images…`
              : imageCount > 1
                ? `Creating ${imageCount} images… This may take several minutes at HD quality.`
                : 'Creating your image… This may take up to a few minutes for HD or Ultra.'}
          </p>
        </div>
      )}
      {error && (
        <div className="image-generator-error">
          <p role="alert">{error}</p>
          <button type="button" disabled={busy || !serverConfigured} onClick={() => runGeneration()}>
            Retry generation
          </button>
        </div>
      )}

      {image && (
        <div className="image-generator-result">
          {(image.images?.length || 0) > 1 ? (
            <GeneratedImageGallery
              message={{
                ...image,
                imageQuality: image.quality,
                imageAspect: image.aspectRatio,
                imageSize: image.size,
                requestedImageCount: imageCount,
                partial: image.partial,
                imageGenerationWarning: image.warnings?.[0],
              }}
              onPreview={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
              onDownloadError={setError}
              onRegenerate={regenerate}
              showUpscale={showUpscale && image.images?.length === 1}
            />
          ) : (
            <figure>
              <img
                src={image.imageUrl}
                alt={image.prompt}
                onError={() => setError('Could not load the image. Please try generating it again.')}
              />
              <div className="image-generator-meta">
                <span>{QUALITY_LABELS[image.quality] || image.quality}</span>
                <span>{ASPECT_LABELS[image.aspectRatio] || image.aspectRatio}</span>
                {image.size && <span>{formatSize(image.size)}</span>}
              </div>
              <figcaption>{image.prompt}</figcaption>
              <div className="image-generator-actions">
                <button type="button" onClick={downloadImage}>Download image</button>
                <button type="button" disabled={busy} onClick={regenerate}>Regenerate</button>
                {showUpscale && <button type="button" disabled={busy} onClick={upscaleImage}>Upscale image</button>}
                <button type="button" disabled={busy} onClick={() => setEditOpen((open) => !open)}>Edit</button>
              </div>
            </figure>
          )}
          {editOpen && (
            <form className="image-generator-edit" onSubmit={applyEdit}>
              <label htmlFor="image-edit-instruction">Describe what to change</label>
              <textarea
                id="image-edit-instruction"
                rows={2}
                maxLength={1200}
                value={editInstruction}
                onChange={(event) => setEditInstruction(event.target.value)}
                placeholder="Example: Make the dragon more realistic and add more purple lightning."
              />
              <button type="submit" disabled={busy || !editInstruction.trim()}>Apply edit</button>
            </form>
          )}
        </div>
      )}
    </dialog>
  );
}
