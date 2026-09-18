import { useEffect, useRef, useState } from 'react';
import { apiFetch, checkChatResponse } from '../../lib/api';
import './ImageGenerator.css';

export default function ImageGenerator({ initialPrompt = '', onClose }) {
  const [prompt, setPrompt] = useState(initialPrompt.slice(0, 4000));
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  const dialog = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.showModal();
    return () => { request.current?.abort(); previousFocus?.focus(); };
  }, []);
  const generate = async (event) => {
    event.preventDefault();
    if (busy || !prompt.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError('');
    try {
      const response = await apiFetch('/api/images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }), signal: controller.signal,
      });
      await checkChatResponse(response);
      const result = await response.json();
      if (!result.imageUrl) throw new Error('The service did not return an image. Please retry.');
      setImage(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure.message);
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <dialog ref={dialog} className="image-generator-dialog" aria-labelledby="image-generator-title" onCancel={onClose}>
    <header><div><h2 id="image-generator-title">Create image</h2><p>Describe your image and AI will create it here.</p></div><button type="button" onClick={onClose} aria-label="Close image generator">×</button></header>
    <form onSubmit={generate}>
      <label htmlFor="image-description">Image description</label>
      <textarea id="image-description" autoFocus rows={3} maxLength={4000} required value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Example: a golden dragon above a city at night, digital illustration" />
      <button type="submit" disabled={busy || !prompt.trim()}>{busy ? 'Creating image…' : 'Generate image'}</button>
    </form>
    {busy && <p role="status">Generation may take a few minutes.</p>}
    {error && <p role="alert">{error}</p>}
    {image && <figure><img src={image.imageUrl} alt={image.prompt} onError={() => setError('Could not load the image. Please try generating it again.')} /><figcaption>{image.prompt}</figcaption><a href={image.imageUrl} download="allmodelai-image.png" target="_blank" rel="noreferrer">Open / save image ↗</a></figure>}
  </dialog>;
}
