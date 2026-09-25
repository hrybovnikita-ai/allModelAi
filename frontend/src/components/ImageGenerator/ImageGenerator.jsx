import { useEffect, useRef, useState } from 'react';
import { checkChatResponse } from '../../lib/api';
import {
  buildImageRequestBody,
  fetchImageGenerationStatus,
  IMAGE_ASPECTS,
  IMAGE_QUALITIES,
  IMAGE_STYLES,
  imageProviderLabel,
  requestImageGeneration,
} from '../../lib/imageGeneration';
import './ImageGenerator.css';

export default function ImageGenerator({ initialPrompt = '', onClose }) {
  const [prompt, setPrompt] = useState(initialPrompt.slice(0, 4000));
  const [style, setStyle] = useState('auto');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [quality, setQuality] = useState('standard');
  const [image, setImage] = useState(null);
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
    });

    try {
      const response = await requestImageGeneration(body, controller.signal);
      await checkChatResponse(response);
      const result = await response.json();
      if (!result.imageUrl) throw new Error('The service did not return an image. Please retry.');
      if (!editText && !useOriginalPrompt) {
        originalPromptRef.current = userPrompt;
      }
      setImage(result);
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

  const downloadImage = () => {
    if (!image?.imageUrl) return;
    const link = document.createElement('a');
    link.href = image.imageUrl;
    link.download = 'allmodelai-image.png';
    link.click();
  };

  return (
    <dialog ref={dialog} className="image-generator-dialog" aria-labelledby="image-generator-title" onCancel={onClose}>
      <header>
        <div>
          <h2 id="image-generator-title">Create image</h2>
          <p>Describe your image and AI will create it here.</p>
          {imageProviderLabel(providerStatus) && (
            <p className="image-generator-provider">{imageProviderLabel(providerStatus)}</p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close image generator">×</button>
      </header>

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
            Aspect ratio
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
              {IMAGE_ASPECTS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Quality
            <select value={quality} onChange={(event) => setQuality(event.target.value)}>
              {IMAGE_QUALITIES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <button type="submit" disabled={busy || !prompt.trim()}>
          {busy ? 'Creating image…' : 'Generate image'}
        </button>
      </form>

      {busy && <p role="status">Generation may take a few minutes.</p>}
      {error && <p role="alert">{error}</p>}

      {image && (
        <figure className="image-generator-result">
          <img
            src={image.imageUrl}
            alt={image.prompt}
            onError={() => setError('Could not load the image. Please try generating it again.')}
          />
          <figcaption>{image.prompt}</figcaption>
          <div className="image-generator-actions">
            <button type="button" onClick={downloadImage}>Download</button>
            <button type="button" disabled={busy} onClick={regenerate}>Regenerate</button>
            <button type="button" disabled={busy} onClick={() => setEditOpen((open) => !open)}>Edit</button>
          </div>
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
        </figure>
      )}
    </dialog>
  );
}
