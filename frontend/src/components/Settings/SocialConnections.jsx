import { useEffect, useState } from 'react';
import { socialSignIn, finishSocialLink, cancelSocialLink } from '../../lib/socialSignIn';
import { socialError } from '../../lib/socialSession';
import { apiFetch } from '../../lib/api';

export default function SocialConnections() {
  const [connected, setConnected] = useState([]);
  const [selected, setSelected] = useState(null);
  const [needsOriginal, setNeedsOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    apiFetch('/api/auth/connections').then(async response => {
      if (!response.ok) throw new Error('Could not load connected accounts.');
      const data = await response.json();
      if (active) setConnected(data.providers);
    }).catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, []);
  const connect = async (existingProvider) => {
    if (busy || !selected) return;
    setBusy(true); setNotice('');
    try {
      if (existingProvider) await finishSocialLink(existingProvider);
      else await socialSignIn(selected, { link: true });
      setConnected(items => [...new Set([...items, `${selected.toLowerCase()}.com`])]);
      setNotice(`${selected} is now connected to this AllModelAI account.`);
      setSelected(null); setNeedsOriginal(false);
    } catch (error) { setNeedsOriginal(error.code === 'auth/account-exists-with-different-credential'); setNotice(socialError(error)); }
    finally { setBusy(false); }
  };
  return <section className="settings-card"><div>
    <h2>Connected accounts</h2>
    <p>Connect a provider to sign in to this same account and keep your conversations and subscription.</p>
    <div className="login-socials">{['Google', 'Apple', 'Facebook'].map(name => <button type="button" key={name} disabled={busy || connected.includes(`${name.toLowerCase()}.com`)} onClick={() => { cancelSocialLink(); setNeedsOriginal(false); setSelected(name); }}>{name}{connected.includes(`${name.toLowerCase()}.com`) ? ' ? Connected' : ''}</button>)}</div>
    {selected && <div role="group" aria-label="Confirm account linking"><p>Allow your {selected} identity to sign in to this AllModelAI account? Only connect an identity you own. This also applies if Apple hides your email.</p><button type="button" disabled={busy} onClick={() => connect()}>{busy ? 'Connecting?' : `Confirm and open ${selected}`}</button><button type="button" disabled={busy} onClick={() => { cancelSocialLink(); setSelected(null); setNeedsOriginal(false); }}>Cancel</button></div>}
    {needsOriginal && <div role="group" aria-label="Verify original provider"><p>Firebase already knows this email under another provider. Verify that original provider to finish connecting {selected}.</p>{['Google', 'Apple', 'Facebook'].filter(name => name !== selected).map(name => <button key={name} type="button" disabled={busy} onClick={() => connect(name)}>Verify with {name}</button>)}</div>}
    {notice && <p role="status">{notice}</p>}
  </div></section>;
}
