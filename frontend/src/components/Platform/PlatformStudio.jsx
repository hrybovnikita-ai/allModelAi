import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import './PlatformStudio.css';

const SECTIONS = [
  ['github', 'GitHub'],
  ['export', 'Export'],
  ['quality', 'AI quality'],
  ['contracts', 'API contracts'],
  ['vault', 'Credentials'],
];

async function readJson(path, options) {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export default function PlatformStudio() {
  const [section, setSection] = useState('github');
  const [github, setGithub] = useState(null);
  const [quality, setQuality] = useState(null);
  const [contracts, setContracts] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState('sample-app');

  useEffect(() => {
    let cancelled = false;
    readJson('/api/platform/github').then((data) => {
      if (!cancelled) setGithub(data);
    }).catch((err) => {
      if (!cancelled) setError(err.message);
    });
    return () => { cancelled = true; };
  }, []);

  async function loadContracts() {
    setError('');
    setContracts(await readJson('/api/platform/contracts'));
  }

  async function runQuality() {
    setBusy(true);
    setError('');
    try {
      setQuality(await readJson('/api/platform/quality/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live: false }),
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadSample() {
    setBusy(true);
    setError('');
    const controller = new AbortController();
    try {
      const response = await apiFetch('/api/platform/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          name: projectName,
          files: [{ path: 'src/app.js', content: 'export const app = "AllModelAI";\n' }],
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Export failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName || 'project'}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="platform-studio">
      <header className="platform-hero">
        <p>AllModelAI platform</p>
        <h1>Development tools</h1>
      </header>
      <nav className="platform-tabs" aria-label="Platform sections">
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" className={section === id ? 'active' : ''} onClick={() => setSection(id)}>{label}</button>
        ))}
      </nav>
      {error ? <p className="platform-error" role="alert">{error}</p> : null}
      {section === 'github' && (
        <section className="platform-card">
          <h2>GitHub Project Assistant</h2>
          <p>{github?.configured ? 'GitHub OAuth is configured.' : 'GitHub OAuth is not configured. Repository access stays disabled until GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set on the server.'}</p>
          <p>{github?.connected ? `Connected as ${github.login}` : 'No GitHub account is connected for this session.'}</p>
          <button type="button" disabled={busy || github?.configured === false} onClick={() => readJson('/api/platform/github/connect', { method: 'POST' }).then((data) => { window.location.href = data.authorizeUrl; }).catch((err) => setError(err.message))}>Connect GitHub</button>
        </section>
      )}
      {section === 'export' && (
        <section className="platform-card">
          <h2>Project export</h2>
          <label htmlFor="project-name">Project name</label>
          <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <button type="button" disabled={busy} onClick={downloadSample}>{busy ? 'Preparing ZIP…' : 'Download ZIP'}</button>
          <p>Real .env files, keys, and parent-directory paths are rejected. A README and .env.example are added when missing.</p>
        </section>
      )}
      {section === 'quality' && (
        <section className="platform-card">
          <h2>AI quality lab</h2>
          <button type="button" disabled={busy} onClick={runQuality}>{busy ? 'Running…' : 'Run mocked checks'}</button>
          {quality ? <p>{quality.passed} passed, {quality.failed} failed. {quality.note}</p> : null}
        </section>
      )}
      {section === 'contracts' && (
        <section className="platform-card">
          <h2>API contracts</h2>
          <button type="button" onClick={() => loadContracts().catch((err) => setError(err.message))}>Load contract list</button>
          <ul>{(contracts?.contracts || []).map((item) => <li key={`${item.method} ${item.path}`}>{item.method} {item.path}</li>)}</ul>
        </section>
      )}
      {section === 'vault' && (
        <section className="platform-card">
          <h2>Credential vault</h2>
          <p>Masked credential status is available only to an administrator with the server admin key. This page does not request or display raw API keys.</p>
        </section>
      )}
    </main>
  );
}
