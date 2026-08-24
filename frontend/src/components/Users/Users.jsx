import { useEffect, useState } from 'react';
import axios from 'axios';
import './Users.css';

const userComments = {
  1: 'AllModelAI makes it easy to compare different models and find the right answer quickly.',
  2: 'The unified workspace is simple, fast, and genuinely useful for my everyday projects.',
  3: 'I love having so many AI tools in one place without switching between different apps.',
  4: 'The model library helps me move from an idea to a finished result much faster.',
  5: 'A clean experience with powerful models and a great community behind it.',
  6: 'It is my favorite way to explore new AI models and learn what each one does best.',
  7: 'The chat experience feels focused and the model choice gives me much more flexibility.',
  8: 'AllModelAI saves me time every day. Everything I need is right where I expect it.',
};

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

        const response = await axios.get('/api/users', {
          signal: controller.signal,
        });

        setUsers(response.data);
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError('Could not load users. Make sure the AllModelAI backend is running.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();

    return () => controller.abort();
  }, []);

  return (
    <section className="users-section" id="users">
      <div className="users-heading">
        <span>Connected through the API</span>
        <h2>AllModelAI community</h2>
        <p>These users are loaded from the Express backend with Axios.</p>
      </div>

      {loading && <div className="users-status" role="status">Loading users...</div>}
      {error && <div className="users-status users-error" role="alert">{error}</div>}

      {!loading && !error && users.length === 0 && (
        <div className="users-status">No users found.</div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="users-grid">
          {users.map((user) => (
            <article className="user-card" key={user.id}>
              <div className="user-avatar" aria-hidden="true">
                {user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </div>
              <div>
                <h3>{user.name}</h3>
                <a href={`mailto:${user.email}`}>{user.email}</a>
              </div>
              <span className="user-id">#{String(user.id).padStart(2, '0')}</span>
            </article>
          ))}
        </div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="comments-heading">
          <span>What the community says</span>
          <h3>Built for curious minds</h3>
        </div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="comments-grid">
          {users.map((user) => (
            <article className="comment-card" key={`comment-${user.id}`}>
              <div className="comment-stars" aria-label="5 out of 5 stars">★★★★★</div>
              <blockquote>“{userComments[user.id] || 'AllModelAI is a powerful and welcoming place to explore what AI can do.'}”</blockquote>
              <footer>
                <span className="comment-avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
                <span><strong>{user.name}</strong><small>AllModelAI member</small></span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
