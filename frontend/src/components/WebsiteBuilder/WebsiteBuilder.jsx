import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './WebsiteBuilder.css';

const starterFiles = {
  html: '<main class="hero">\n  <nav><strong>Nova</strong><a href="#features">Features</a></nav>\n  <section>\n    <p class="eyebrow">BUILT WITH ALLMODEL AI</p>\n    <h1>Turn an idea into a working website.</h1>\n    <p class="intro">Describe your website, generate the files, and refine every detail in the live editor.</p>\n    <button id="action">Start building</button>\n  </section>\n</main>',
  css: '* { box-sizing: border-box; }\nbody { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f4f5f7; color: #15171a; }\n.hero { min-height: 100vh; padding: 28px clamp(24px, 6vw, 90px); background: linear-gradient(135deg, #ffffff 0 55%, #dcefe8 55%); }\nnav { display: flex; justify-content: space-between; align-items: center; }\nnav a { color: inherit; text-decoration: none; }\nsection { max-width: 720px; padding-top: 18vh; }\n.eyebrow { color: #087f5b; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; }\nh1 { max-width: 680px; margin: 12px 0 18px; font-size: clamp(42px, 7vw, 82px); line-height: .98; }\n.intro { max-width: 560px; color: #565d66; font-size: 18px; line-height: 1.65; }\nbutton { margin-top: 20px; padding: 13px 18px; border: 0; background: #15171a; color: white; font: inherit; font-weight: 700; cursor: pointer; }',
  js: "document.querySelector('#action')?.addEventListener('click', () => {\n  document.querySelector('#action').textContent = 'Website is live';\n});",
};

const readSavedFiles = () => {
  try { return JSON.parse(localStorage.getItem('allmodelai_website_files')) || starterFiles; }
  catch { return starterFiles; }
};

const extractBlock = (text, names) => {
  for (const name of names) {
    const match = text.match(new RegExp('```' + name + '\\s*([\\s\\S]*?)```', 'i'));
    if (match) return match[1].trim();
  }
  return '';
};

const readStream = async (response) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      const line = event.split('\n').find((item) => item.startsWith('data: '));
      if (!line || line.slice(6) === '[DONE]') continue;
      const data = JSON.parse(line.slice(6));
      if (data.text) text += data.text;
    }
    if (done) return text;
  }
};

export default function WebsiteBuilder() {
  const savedUser = sessionStorage.getItem('allmodelai_user');
  const user = savedUser ? JSON.parse(savedUser) : null;
  const [files, setFiles] = useState(readSavedFiles);
  const [activeFile, setActiveFile] = useState('html');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const [viewport, setViewport] = useState('desktop');

  const preview = useMemo(() => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${files.css}</style></head><body>${files.html}<script>${files.js}<\/script></body></html>`, [files]);
  if (!user) return <Navigate to="/" replace />;

  const updateFile = (value) => {
    const next = { ...files, [activeFile]: value };
    setFiles(next);
    localStorage.setItem('allmodelai_website_files', JSON.stringify(next));
  };

  const generateWebsite = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const instruction = `Build a polished, responsive website for this request: ${prompt}\n\nReturn exactly three complete fenced code blocks in this order: html, css, javascript. The HTML must contain body content only, CSS must be plain CSS, and JavaScript must be browser JavaScript. Do not use external frameworks. Make the interface functional and accessible.`;
      const response = await apiFetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt', temporary: true, maxTokens: 3072, messages: [{ role: 'user', text: instruction }] }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || 'Website generation failed.'); }
      const answer = await readStream(response);
      const next = {
        html: extractBlock(answer, ['html']) || files.html,
        css: extractBlock(answer, ['css']) || files.css,
        js: extractBlock(answer, ['javascript', 'js']) || files.js,
      };
      setFiles(next);
      localStorage.setItem('allmodelai_website_files', JSON.stringify(next));
      setPreviewKey((key) => key + 1);
    } catch (requestError) {
      setError(requestError.message || 'Could not generate the website.');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([preview], { type: 'text/html' }));
    link.download = 'allmodelai-website.html';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <main className="website-builder">
    <header className="builder-header">
      <Link to="/dashboard" className="builder-brand"><span>AI</span>AllModelAI</Link>
      <div className="builder-title"><strong>Website Builder</strong><small>Saved locally</small></div>
      <nav><Link to="/chat">Chat</Link><Link to="/studio">Studio</Link><button type="button" onClick={download}>Download</button></nav>
    </header>

    <section className="builder-prompt">
      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the website you want to build..." rows="2" />
      <button type="button" disabled={!prompt.trim() || busy} onClick={generateWebsite}>{busy ? 'Building...' : 'Build with AI'}</button>
      {error && <p role="alert">{error}</p>}
    </section>

    <div className="builder-workspace">
      <section className="builder-editor">
        <div className="file-tabs" role="tablist">
          {['html', 'css', 'js'].map((file) => <button type="button" role="tab" aria-selected={activeFile === file} className={activeFile === file ? 'active' : ''} onClick={() => setActiveFile(file)} key={file}><i />{file === 'js' ? 'JavaScript' : file.toUpperCase()}</button>)}
        </div>
        <div className="editor-filebar"><span>{activeFile === 'js' ? 'script.js' : activeFile === 'css' ? 'styles.css' : 'index.html'}</span><small>{files[activeFile].split('\n').length} lines</small></div>
        <textarea className="code-editor" value={files[activeFile]} onChange={(event) => updateFile(event.target.value)} spellCheck="false" aria-label={`${activeFile} code`} />
      </section>

      <section className="builder-preview">
        <header><strong>Live Preview</strong><div className="viewport-switcher">{['desktop', 'tablet', 'mobile'].map((size) => <button type="button" className={viewport === size ? 'active' : ''} onClick={() => setViewport(size)} aria-label={`${size} preview`} title={`${size} preview`} key={size}>{size === 'desktop' ? '▰' : size === 'tablet' ? '▯' : '▯'}</button>)}</div><button type="button" onClick={() => setPreviewKey((key) => key + 1)} aria-label="Refresh preview" title="Refresh preview">↻</button></header>
        <div className={`preview-stage ${viewport}`}><iframe key={previewKey} title="Generated website preview" sandbox="allow-scripts" srcDoc={preview} /></div>
      </section>
    </div>
  </main>;
}
