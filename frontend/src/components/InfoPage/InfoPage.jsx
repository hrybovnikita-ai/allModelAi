import { Link } from 'react-router-dom';
import { useState } from 'react';
import { resolveApiUrl } from '../../lib/apiBase';
import './InfoPage.css';

const SUPPORT_EMAIL = 'support@allmodelai.com';

const pages = {
  privacy: ['Privacy Policy', 'We keep account and workspace data only to provide AllModelAI features. Payment card details are collected and processed by Stripe, Creem, Paddle, or WayForPay and are never stored on AllModelAI servers. AI chat content may be processed by third-party model providers according to your settings.'],
  terms: ['Terms of Service', 'Use AllModelAI responsibly. AI responses can be inaccurate, so review important information before relying on it. Prepaid AI credits are non-transferable and consumed per usage rules published in the product. Generating NSFW, explicit, sexually suggestive, illegal, or harmful image or video content is prohibited and may result in suspension without refund.'],
  refund: ['Refund Policy', 'Paid subscriptions and prepaid AI credit packs are processed by our payment partners (Stripe, Creem, Paddle, or WayForPay). Refund eligibility depends on the product type, unused credit balance, and applicable law. Contact support before disputing a charge.'],
  cookies: ['Cookie Policy', 'AllModelAI uses an HttpOnly session cookie to keep you signed in. It does not contain your password or payment information.'],
  aup: ['Acceptable Use Policy', 'Do not use AllModelAI for illegal activity, malware, harassment, NSFW or sexually explicit image/video generation, deepfakes, face-swap abuse, or attempts to bypass provider safety systems. Automated abuse, credential stuffing, and reselling access without authorization are prohibited. We may suspend accounts that violate this policy.'],
  contact: ['Contact & Support', `Questions about billing, privacy, or technical issues? Email ${SUPPORT_EMAIL}. We aim to respond within two business days.`],
};

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
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        )}
        <h2>Last updated</h2>
        <p>{new Date().toLocaleDateString()}</p>
      </article>
    </main>
  );
}

export const LEGAL_PAGE_TYPES = Object.keys(pages);

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
