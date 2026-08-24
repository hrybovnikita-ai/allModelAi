import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import './SocialAuth.css';

const providerColors = { google: '#4285f4', apple: '#111827', facebook: '#1877f2' };

export default function SocialAuth() {
  const { provider = '' } = useParams();
  const navigate = useNavigate();
  const providerKey = provider.toLowerCase();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    let active = true;
    axios.get(`/api/auth/${providerKey}/accounts`)
      .then(({ data }) => active && setAccounts(data.accounts))
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'This provider is unavailable.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [providerKey]);

  const providerName = providerKey.charAt(0).toUpperCase() + providerKey.slice(1);
  const continueWithAccount = async () => {
    if (!selectedAccount) return;
    setContinuing(true);
    setError('');
    try {
      const { data } = await axios.post('/api/auth/social', { provider: providerKey, accountId: selectedAccount.id }, { withCredentials: true });
      sessionStorage.setItem('allmodelai_user', JSON.stringify(data.user));
      navigate('/dashboard', { state: { user: data.user }, replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not complete sign in.');
      setContinuing(false);
    }
  };

  return (
    <main className="social-auth-page">
      <section className="social-auth-card" aria-labelledby="social-auth-title">
        <Link className="social-auth-brand" to="/">AllModel<span>AI</span></Link>
        <div className="social-auth-provider" style={{ backgroundColor: providerColors[providerKey] || '#6366f1' }}>{providerName.charAt(0)}</div>
        <p className="social-auth-eyebrow">Continue with {providerName}</p>
        <h1 id="social-auth-title">Choose an account</h1>
        <p className="social-auth-intro">Select an account to continue to your AllModelAI workspace.</p>
        {loading && <p className="social-auth-status">Loading accounts...</p>}
        {!loading && accounts.map((account) => (
          <button className={`social-auth-account ${selectedAccount?.id === account.id ? 'is-selected' : ''}`} key={account.id} type="button" onClick={() => setSelectedAccount(account)} aria-pressed={selectedAccount?.id === account.id}>
            <span className="social-auth-avatar">{account.name.charAt(0)}</span>
            <span><strong>{account.name}</strong><small>{account.email}</small></span>
            <span className="social-auth-check" aria-hidden="true">{selectedAccount?.id === account.id ? '✓' : ''}</span>
          </button>
        ))}
        {error && <p className="social-auth-error" role="alert">{error}</p>}
        {selectedAccount && <div className="social-auth-actions"><Link to="/">Cancel</Link><button type="button" onClick={continueWithAccount} disabled={continuing}>{continuing ? 'Connecting...' : 'Continue'}</button></div>}
        <p className="social-auth-note">You can choose a different account at any time.</p>
      </section>
    </main>
  );
}