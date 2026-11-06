import { Link } from 'react-router-dom';
import { useState } from 'react';
import { resolveApiUrl } from '../../lib/apiBase';
import { pages, SUPPORT_EMAIL_INFO } from './infoPageContent.js';
import './InfoPage.css';

export function InfoPage({ type }) {
  const [title, text] = pages[type] || pages.privacy;
  return (
    <main className="info-page">
      <nav><Link to="/">← AllModelAI</Link><Link to="/dashboard">Dashboard</Link></nav>
      <article>
        <span>AllModelAI</span>
        <h1>{title}</h1>
        <p>{text}</p>
        {type === 'contact' && (
          <p>
            <a href={`mailto:${SUPPORT_EMAIL_INFO}`}>{SUPPORT_EMAIL_INFO}</a>
          </p>
        )}
        <h2>Last updated</h2>
        <p>{new Date().toLocaleDateString()}</p>
      </article>
    </main>
  );
}

export function ApiDocs() {
  const [testResult, setTestResult] = useState('');
  const testApi = async () => { const response = await fetch(resolveApiUrl('/api/status/models')); setTestResult(response.ok ? 'API is online and ready.' : 'API returned an error.'); };
  return <main className="info-page api-page"><nav><Link to="/">← AllModelAI</Link><Link to="/dashboard">Dashboard</Link></nav><article><span>Developer tools</span><h1>AllModelAI API</h1><p>One endpoint for chat, model status, saved conversations, and workspace tools.</p><pre><code>{`POST /api/chat
Content-Type: application/json

{
  "model": "gemini",
  "userEmail": "you@example.com",
  "messages": [{ "role": "user", "text": "Hello" }]
}`}</code></pre><button type="button" onClick={testApi}>Test API connection</button>{testResult && <strong className="api-result" role="status">{testResult}</strong>}</article></main>;
}
