import { Link } from 'react-router-dom';
import { useState } from 'react';
import './InfoPage.css';

const pages = {
  privacy: ['Privacy Policy', 'We keep account and workspace data only to provide AllModelAI features. Payment card details are collected and processed by Stripe and are never sent to the AllModelAI backend.'],
  terms: ['Terms of Service', 'Use AllModelAI responsibly. AI responses can be inaccurate, so review important information before relying on it.'],
  refund: ['Refund Policy', 'Paid subscriptions are processed by Stripe. Refund eligibility and cancellation terms must be reviewed before production launch and displayed for the customer jurisdiction.'],
  cookies: ['Cookie Policy', 'AllModelAI uses an HttpOnly session cookie to keep you signed in. It does not contain your password or payment information.'],
};

export function InfoPage({ type }) {
  const [title, text] = pages[type] || pages.privacy;
  return <main className="info-page"><nav><Link to="/">← AllModelAI</Link><Link to="/dashboard">Dashboard</Link></nav><article><span>AllModelAI</span><h1>{title}</h1><p>{text}</p><h2>Last updated</h2><p>{new Date().toLocaleDateString()}</p></article></main>;
}

export function ApiDocs() {
  const [testResult, setTestResult] = useState('');
  const testApi = async () => { const response = await fetch('/api/status/models'); setTestResult(response.ok ? 'API is online and ready.' : 'API returned an error.'); };
  return <main className="info-page api-page"><nav><Link to="/">← AllModelAI</Link><Link to="/dashboard">Dashboard</Link></nav><article><span>Developer tools</span><h1>AllModelAI API</h1><p>One endpoint for chat, model status, saved conversations, and workspace tools.</p><pre><code>{`POST /api/chat
Content-Type: application/json

{
  "model": "gemini",
  "userEmail": "you@example.com",
  "messages": [{ "role": "user", "text": "Hello" }]
}`}</code></pre><button type="button" onClick={testApi}>Test API connection</button>{testResult && <strong className="api-result" role="status">{testResult}</strong>}</article></main>;
}
