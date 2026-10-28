import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import './StudioLabs.css';

const TABS = [
  ['bugs', 'Bug reports'],
  ['tasks', 'Scheduled tasks'],
  ['data', 'Data analysis'],
  ['config', 'Configuration'],
  ['tools', 'AI tools'],
  ['structured', 'Structured output'],
  ['evidence', 'Evidence checker'],
  ['prototype', 'Prototype studio'],
  ['motion', 'Motion studio'],
];

async function postJson(path, body) {
  const response = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

export default function StudioLabs() {
  const [tab, setTab] = useState('bugs');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [output, setOutput] = useState('{"name":"Ada"}');
  const [claim, setClaim] = useState('');
  const [passage, setPassage] = useState('');
  const [motion, setMotion] = useState(() => {
    try { return JSON.parse(localStorage.getItem('allmodelai_motion') || '{"duration":240,"easing":"ease"}'); } catch { return { duration: 240, easing: 'ease' }; }
  });

  async function run(action) {
    setError('');
    try { setMessage(JSON.stringify(await action(), null, 2)); } catch (err) { setError(err.message); }
  }

  return (
    <main className="studio-labs">
      <header>
        <h1>Development studio</h1>
        <p>Local checks for reports, schedules, data, tools, and prototypes. Paid model calls stay off.</p>
      </header>
      <nav aria-label="Studio sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <section>
        {tab === 'bugs' && (
          <>
            <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <button type="button" onClick={() => run(() => postJson('/api/studio/bugs', { title, log: 'token sk-secretvalue' }))}>Create report</button>
          </>
        )}
        {tab === 'tasks' && <button type="button" onClick={() => run(() => postJson('/api/studio/schedules', { name: 'Daily summary', recurrence: 'daily', timeZone: 'UTC' }))}>Schedule daily summary</button>}
        {tab === 'data' && <button type="button" onClick={() => run(() => postJson('/api/studio/datasets/analyze', { name: 'sample.csv', text: 'name,score\nAda,10\n' }))}>Analyze sample CSV</button>}
        {tab === 'config' && <p>Configuration names are available to administrators only. Values are never shown.</p>}
        {tab === 'tools' && <button type="button" onClick={() => run(() => postJson('/api/studio/tools/call', { name: 'calculator', args: { a: 2, b: 2 } }))}>Run calculator</button>}
        {tab === 'structured' && (
          <>
            <textarea value={output} onChange={(event) => setOutput(event.target.value)} />
            <button type="button" onClick={() => run(() => postJson('/api/studio/structured/validate', { output, schema: { required: ['name'] } }))}>Validate JSON</button>
          </>
        )}
        {tab === 'evidence' && (
          <>
            <label>Claim<input value={claim} onChange={(event) => setClaim(event.target.value)} /></label>
            <label>Passage<input value={passage} onChange={(event) => setPassage(event.target.value)} /></label>
            <button type="button" onClick={() => run(() => postJson('/api/studio/evidence/check', { claims: [claim], passages: [{ id: 'p1', text: passage }] }))}>Check evidence</button>
          </>
        )}
        {tab === 'prototype' && <p>Prototype screens stay in this browser. Generated scripts are not executed in the app origin.</p>}
        {tab === 'motion' && (
          <>
            <label>Duration (ms)<input type="range" min="80" max="600" value={motion.duration} onChange={(event) => setMotion({ ...motion, duration: Number(event.target.value) })} /></label>
            <div className="motion-preview" style={{ animationDuration: `${motion.duration}ms` }}>Preview</div>
            <button type="button" onClick={() => { localStorage.setItem('allmodelai_motion', JSON.stringify(motion)); setMessage('Motion preset saved on this device'); }}>Save motion preset</button>
          </>
        )}
        {error ? <p className="studio-error" role="alert">{error}</p> : null}
        {message ? <pre>{message}</pre> : null}
      </section>
    </main>
  );
}
