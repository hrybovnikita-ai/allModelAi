import { useEffect, useState } from 'react';
import { resolveApiUrl } from '../../lib/apiBase';
import { parseCommunityUsersPayload } from '../../lib/communityUsers';
import HomeReveal from '../HomeReveal/HomeReveal';
import './Users.css';

/** Illustrative quotes only — not attributed to live community members. */
const SAMPLE_FEEDBACK = [
  {
    id: 'sample-1',
    quote: 'Comparing models in one workspace helps me choose the right answer faster.',
    persona: 'Product designer',
  },
  {
    id: 'sample-2',
    quote: 'Smart Router and a single chat experience keep my daily AI work focused.',
    persona: 'Software engineer',
  },
  {
    id: 'sample-3',
    quote: 'I like exploring new models without jumping between different apps.',
    persona: 'Researcher',
  },
];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const fetchUsers = async () => {
      try {
        setLoading(true);
        setError('');

        const url = resolveApiUrl('/api/users');
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });

        const text = await response.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        if (!response.ok) {
          throw new Error(data?.message || `Could not load community members (${response.status}).`);
        }

        const list = parseCommunityUsersPayload(data);
        if (!list) {
          throw new Error(
            'The server returned an unexpected response. Check VITE_API_BASE_URL and that /api/users is reachable.',
          );
        }

        setUsers(list);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Could not reach the AllModelAI API. Please try again shortly.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();

    return () => controller.abort();
  }, []);

  return (
    <HomeReveal as="section" className="users-section" id="users">
      <div className="users-heading">
        <span>Connected through the API</span>
        <h2>AllModelAI community</h2>
        <p>Members shown here come from the public directory — names only, no private account details.</p>
      </div>

      {loading && <div className="users-status" role="status">Loading users...</div>}
      {error && <div className="users-status users-error" role="alert">{error}</div>}

      {!loading && !error && users.length === 0 && (
        <div className="users-status">No public community members to show yet.</div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="users-grid">
          {users.map((user) => (
            <article className="user-card" key={user.id}>
              <div className="user-avatar" aria-hidden="true">
                {String(user.name).split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </div>
              <div>
                <h3>{user.name}</h3>
                <p className="user-member-label">AllModelAI member</p>
              </div>
              <span className="user-id">#{String(user.id).padStart(2, '0')}</span>
            </article>
          ))}
        </div>
      )}

      <div className="comments-heading">
        <span>What people look for</span>
        <h3>Built for curious minds</h3>
        <p className="sample-note">
          Sample feedback for illustration — not verified reviews from the members listed above.
        </p>
      </div>

      <div className="comments-grid">
        {SAMPLE_FEEDBACK.map((item) => (
          <article className="comment-card" key={item.id}>
            <span className="sample-feedback-badge">Sample feedback</span>
            <blockquote>“{item.quote}”</blockquote>
            <footer>
              <span className="comment-avatar" aria-hidden="true">✦</span>
              <span>
                <strong>{item.persona}</strong>
                <small>Illustrative persona</small>
              </span>
            </footer>
          </article>
        ))}
      </div>
    </HomeReveal>
  );
}
