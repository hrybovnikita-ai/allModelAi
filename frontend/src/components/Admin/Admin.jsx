import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Admin.css';

export default function Admin() {
  const [key, setKey] = useState('');
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const loadStats = async (event) => {
    event.preventDefault();
    const response = await fetch('/api/admin/stats', { headers: { 'x-admin-key': key } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setError(data.message || 'Could not load admin statistics.'); setStats(null); return; }
    setError(''); setStats(data);
  };
  return <main className="admin-page"><nav><Link to="/">← AllModelAI</Link><strong>Admin dashboard</strong></nav><section className="admin-shell"><span>Operations</span><h1>Workspace health</h1><p>Review usage and active sessions without exposing private account data.</p><form onSubmit={loadStats}><label>Admin key<input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Enter ADMIN_KEY" required /></label><button type="submit">Load statistics</button></form>{error && <p className="admin-error" role="alert">{error}</p>}{stats && <div className="admin-stats">{[['Users', stats.users], ['Conversations', stats.conversations], ['Purchases', stats.purchases], ['Active sessions', stats.activeSessions]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</div>}</section></main>;
}
