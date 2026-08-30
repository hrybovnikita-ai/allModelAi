import { useState, useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { dashboardModels } from '../../data/dashboardModels';
import './Arena.css';

const candidates = ['gpt', 'claude', 'gemini', 'cloudflare'];

async function ask(model, prompt, email) {
  const started = performance.now();
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', text: prompt }],
      userEmail: email,
      temporary: true
    })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Request failed');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', text = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.replaceAll('\r\n', '\n').split('\n\n');
    buffer = events.pop() || '';
    for (const raw of events) {
      const line = raw.split('\n').find(item => item.startsWith('data: '));
      if (!line || line.slice(6) === '[DONE]') continue;
      const event = JSON.parse(line.slice(6));
      if (event.text) text += event.text;
    }
    if (done) break;
  }
  return { text, seconds: ((performance.now() - started) / 1000).toFixed(1) };
}

export default function Arena() {
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const [params] = useSearchParams();
  const initial = params.get('models');

  // Mode: 'side-by-side', 'blind', 'leaderboard'
  const [mode, setMode] = useState('side-by-side');

  // Standard Arena State
  const [selected, setSelected] = useState(
    initial && candidates.includes(initial)
      ? [initial, 'gpt'].filter((v, i, a) => a.indexOf(v) === i)
      : ['gpt', 'claude', 'gemini']
  );
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState('');

  // Blind Battle State
  const [blindRunning, setBlindRunning] = useState(false);
  const [blindModelA, setBlindModelA] = useState('');
  const [blindModelB, setBlindModelB] = useState('');
  const [blindResultA, setBlindResultA] = useState(null);
  const [blindResultB, setBlindResultB] = useState(null);
  const [voted, setVoted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [blindWinner, setBlindWinner] = useState('');

  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');

  // Fetch leaderboard when mode changes to 'leaderboard'
  useEffect(() => {
    if (mode === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [mode]);

  const fetchLeaderboard = async () => {
    setLeaderboardLoading(true);
    setLeaderboardError('');
    try {
      const res = await fetch('/api/arena/leaderboard');
      if (!res.ok) throw new Error('Failed to fetch leaderboard');
      const data = await res.json();
      setLeaderboard(data);
    } catch (err) {
      setLeaderboardError(err.message);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  if (!user) return <Navigate to="/" replace />;

  // Standard Arena toggling
  const toggle = slug => setSelected(
    current => current.includes(slug)
      ? current.filter(item => item !== slug)
      : current.length < 4 ? [...current, slug] : current
  );

  // Run Standard Arena
  const run = async () => {
    if (!prompt.trim() || selected.length < 2) return;
    setRunning(true);
    setWinner('');
    setResults(Object.fromEntries(selected.map(model => [model, { loading: true }])));
    await Promise.all(
      selected.map(async model => {
        try {
          const result = await ask(model, prompt, user.email);
          setResults(current => ({ ...current, [model]: result }));
        } catch (error) {
          setResults(current => ({ ...current, [model]: { error: error.message } }));
        }
      })
    );
    setRunning(false);
  };

  // Run Blind Battle
  const runBlind = async () => {
    if (!prompt.trim()) return;
    setBlindRunning(true);
    setVoted(false);
    setRevealed(false);
    setBlindWinner('');
    setBlindResultA(null);
    setBlindResultB(null);

    const pool = ['gpt', 'claude', 'gemini', 'cloudflare', 'deepseek', 'llama'];
    const idxA = Math.floor(Math.random() * pool.length);
    let idxB = Math.floor(Math.random() * pool.length);
    while (idxB === idxA) {
      idxB = Math.floor(Math.random() * pool.length);
    }

    const modelA = pool[idxA];
    const modelB = pool[idxB];
    setBlindModelA(modelA);
    setBlindModelB(modelB);

    setBlindResultA({ loading: true });
    setBlindResultB({ loading: true });

    await Promise.all([
      (async () => {
        try {
          const result = await ask(modelA, prompt, user.email);
          setBlindResultA(result);
        } catch (error) {
          setBlindResultA({ error: error.message });
        }
      })(),
      (async () => {
        try {
          const result = await ask(modelB, prompt, user.email);
          setBlindResultB(result);
        } catch (error) {
          setBlindResultB({ error: error.message });
        }
      })()
    ]);

    setBlindRunning(false);
  };

  // Cast vote in Blind Battle
  const handleVote = async (choice) => {
    if (voted) return;
    setVoted(true);
    setBlindWinner(choice);
    setRevealed(true);

    try {
      await fetch('/api/arena/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_a: blindModelA,
          model_b: blindModelB,
          winner: choice
        })
      });
    } catch (err) {
      console.error('Failed to log arena vote:', err);
    }
  };

  return (
    <main className="arena-page">
      <nav>
        <Link to="/dashboard">← Dashboard</Link>
        <strong>⚔ AI Arena</strong>
        <Link to="/explore">Model Explorer</Link>
      </nav>

      <header>
        <p>PARALLEL MODEL COMPARISON</p>
        {mode === 'side-by-side' && (
          <>
            <h1>One prompt. Multiple minds.</h1>
            <span>Compare answers side by side and choose your winner.</span>
          </>
        )}
        {mode === 'blind' && (
          <>
            <h1>Blind Battle Duel</h1>
            <span>Prompt two anonymous models. Vote on the best output to reveal their identities.</span>
          </>
        )}
        {mode === 'leaderboard' && (
          <>
            <h1>Arena Leaderboard</h1>
            <span>See which AI models rank highest based on user feedback and Elo ratings.</span>
          </>
        )}

        <div className="arena-mode-tabs">
          <button className={mode === 'side-by-side' ? 'active' : ''} onClick={() => setMode('side-by-side')}>
            Side-by-Side Arena
          </button>
          <button className={mode === 'blind' ? 'active' : ''} onClick={() => setMode('blind')}>
            Blind Battle (Duels)
          </button>
          <button className={mode === 'leaderboard' ? 'active' : ''} onClick={() => setMode('leaderboard')}>
            Leaderboard
          </button>
        </div>

        {mode !== 'leaderboard' && (
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe a real task for the models to solve…"
            disabled={running || blindRunning}
          />
        )}

        {mode === 'side-by-side' && (
          <>
            <div className="arena-picker">
              {candidates.map(slug => {
                const model = dashboardModels.find(item => item.slug === slug);
                return (
                  <button
                    className={selected.includes(slug) ? 'active' : ''}
                    onClick={() => toggle(slug)}
                    key={slug}
                  >
                    <img src={model?.image} alt={model?.name} />
                    {model?.name}
                    <i>{selected.includes(slug) ? '✓' : '+'}</i>
                  </button>
                );
              })}
            </div>
            <button
              className="arena-run"
              disabled={running || !prompt.trim() || selected.length < 2}
              onClick={run}
            >
              {running ? 'Models are thinking…' : 'Run comparison →'}
            </button>
          </>
        )}

        {mode === 'blind' && (
          <div className="blind-actions">
            <button
              className="arena-run"
              disabled={blindRunning || !prompt.trim()}
              onClick={runBlind}
            >
              {blindRunning ? 'Duel in progress…' : 'Start Duel →'}
            </button>
            {revealed && (
              <button
                className="arena-run reset-duel"
                onClick={() => {
                  setPrompt('');
                  setBlindResultA(null);
                  setBlindResultB(null);
                  setVoted(false);
                  setRevealed(false);
                  setBlindWinner('');
                }}
              >
                Reset Duel 🔄
              </button>
            )}
          </div>
        )}
      </header>

      {/* Render Side-by-Side Results */}
      {mode === 'side-by-side' && (
        <section className="arena-results">
          {selected.map(slug => {
            const model = dashboardModels.find(item => item.slug === slug);
            const result = results[slug];
            return (
              <article className={winner === slug ? 'winner' : ''} key={slug}>
                <div className="arena-model">
                  <img src={model?.image} alt={model?.name} />
                  <span>
                    <small>{model?.provider}</small>
                    <strong>{model?.name}</strong>
                  </span>
                  {result?.seconds && <i>{result.seconds}s</i>}
                </div>
                <div className="arena-answer">
                  {!result && <p>Ready for the next comparison.</p>}
                  {result?.loading && (
                    <div className="arena-loading">
                      <i />
                      <i />
                      <i />
                    </div>
                  )}
                  {result?.error && <p className="arena-error">{result.error}</p>}
                  {result?.text && <p>{result.text}</p>}
                </div>
                {result?.text && (
                  <footer>
                    <button onClick={() => navigator.clipboard.writeText(result.text)}>Copy</button>
                    <button
                      className={winner === slug ? 'selected' : ''}
                      onClick={() => setWinner(slug)}
                    >
                      {winner === slug ? '★ Winner' : 'Choose winner'}
                    </button>
                  </footer>
                )}
              </article>
            );
          })}
        </section>
      )}

      {/* Render Blind Battle Results */}
      {mode === 'blind' && (blindResultA || blindResultB) && (
        <>
          <section className="arena-results blind-results">
            {/* Model A Card */}
            <article className={`blind-card ${blindWinner === 'model_a' ? 'winner' : ''}`}>
              <div className="arena-model">
                {revealed ? (
                  <>
                    <img src={dashboardModels.find(m => m.slug === blindModelA)?.image} alt={blindModelA} />
                    <span>
                      <small>{dashboardModels.find(m => m.slug === blindModelA)?.provider}</small>
                      <strong>{dashboardModels.find(m => m.slug === blindModelA)?.name} (Model A)</strong>
                    </span>
                    {blindResultA?.seconds && <i>{blindResultA.seconds}s</i>}
                  </>
                ) : (
                  <>
                    <div className="anonymous-avatar">🤖</div>
                    <span>
                      <small>Anonymous</small>
                      <strong>Model A</strong>
                    </span>
                  </>
                )}
              </div>
              <div className="arena-answer">
                {blindResultA?.loading && (
                  <div className="arena-loading">
                    <i />
                    <i />
                    <i />
                  </div>
                )}
                {blindResultA?.error && <p className="arena-error">{blindResultA.error}</p>}
                {blindResultA?.text && <p>{blindResultA.text}</p>}
              </div>
            </article>

            {/* Model B Card */}
            <article className={`blind-card ${blindWinner === 'model_b' ? 'winner' : ''}`}>
              <div className="arena-model">
                {revealed ? (
                  <>
                    <img src={dashboardModels.find(m => m.slug === blindModelB)?.image} alt={blindModelB} />
                    <span>
                      <small>{dashboardModels.find(m => m.slug === blindModelB)?.provider}</small>
                      <strong>{dashboardModels.find(m => m.slug === blindModelB)?.name} (Model B)</strong>
                    </span>
                    {blindResultB?.seconds && <i>{blindResultB.seconds}s</i>}
                  </>
                ) : (
                  <>
                    <div className="anonymous-avatar">🤖</div>
                    <span>
                      <small>Anonymous</small>
                      <strong>Model B</strong>
                    </span>
                  </>
                )}
              </div>
              <div className="arena-answer">
                {blindResultB?.loading && (
                  <div className="arena-loading">
                    <i />
                    <i />
                    <i />
                  </div>
                )}
                {blindResultB?.error && <p className="arena-error">{blindResultB.error}</p>}
                {blindResultB?.text && <p>{blindResultB.text}</p>}
              </div>
            </article>
          </section>

          {/* Voting Controls */}
          {!blindRunning && (blindResultA?.text || blindResultB?.text) && (
            <div className="blind-voting-bar">
              <h3>Which response is better?</h3>
              <div className="blind-voting-buttons">
                <button
                  className={`vote-btn btn-a ${blindWinner === 'model_a' ? 'selected' : ''}`}
                  disabled={voted}
                  onClick={() => handleVote('model_a')}
                >
                  👈 Model A is Better
                </button>
                <button
                  className={`vote-btn btn-tie ${blindWinner === 'tie' ? 'selected' : ''}`}
                  disabled={voted}
                  onClick={() => handleVote('tie')}
                >
                  🤝 Tie
                </button>
                <button
                  className={`vote-btn btn-b ${blindWinner === 'model_b' ? 'selected' : ''}`}
                  disabled={voted}
                  onClick={() => handleVote('model_b')}
                >
                  Model B is Better 👉
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Render Leaderboard */}
      {mode === 'leaderboard' && (
        <section className="leaderboard-section">
          {leaderboardLoading && (
            <div className="leaderboard-loading">
              <div className="arena-loading">
                <i />
                <i />
                <i />
              </div>
              <p>Calculating Elo ratings...</p>
            </div>
          )}

          {leaderboardError && <p className="arena-error center">{leaderboardError}</p>}

          {!leaderboardLoading && !leaderboardError && (
            <div className="leaderboard-container">
              <table className="leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Model</th>
                    <th>Provider</th>
                    <th>Elo Rating</th>
                    <th>Win Rate</th>
                    <th>Matches</th>
                    <th>W / L / T</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((item, index) => {
                    const modelDetails = dashboardModels.find(m => m.slug === item.model);
                    const name = modelDetails ? modelDetails.name : item.model.toUpperCase();
                    const provider = modelDetails ? modelDetails.provider : 'Unknown';
                    const image = modelDetails ? modelDetails.image : null;

                    let rankIcon = `${index + 1}`;
                    if (index === 0) rankIcon = '🥇';
                    else if (index === 1) rankIcon = '🥈';
                    else if (index === 2) rankIcon = '🥉';

                    return (
                      <tr key={item.model} className={`rank-row row-${index + 1}`}>
                        <td className="rank-col">
                          <span className="rank-badge">{rankIcon}</span>
                        </td>
                        <td className="model-col">
                          <div className="leaderboard-model-info">
                            {image && <img src={image} alt={name} className="model-img" />}
                            <strong>{name}</strong>
                          </div>
                        </td>
                        <td className="provider-col">{provider}</td>
                        <td className="elo-col">
                          <span className="elo-badge">{item.elo}</span>
                        </td>
                        <td className="winrate-col">
                          <div className="winrate-container">
                            <span className="winrate-txt">{item.winRate}%</span>
                            <div className="winrate-bar-bg">
                              <div
                                className="winrate-bar-fill"
                                style={{ width: `${item.winRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>{item.matches}</td>
                        <td className="stats-col">
                          <span className="win-count">{item.wins}</span>
                          {' / '}
                          <span className="loss-count">{item.losses}</span>
                          {' / '}
                          <span className="tie-count">{item.ties}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {leaderboard.length === 0 && (
                <div className="empty-leaderboard">
                  <p>No battles have been recorded yet. Start a Blind Battle to build the leaderboard!</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Side-by-Side Winner Toast */}
      {mode === 'side-by-side' && winner && (
        <div className="winner-toast">
          🏆 {dashboardModels.find(item => item.slug === winner)?.name} won this round
        </div>
      )}

      {/* Blind Reveal Toast */}
      {mode === 'blind' && revealed && (
        <div className="winner-toast blind-reveal-toast">
          {blindWinner === 'tie' ? (
            <span>🤝 It was a Tie between {dashboardModels.find(m => m.slug === blindModelA)?.name} and {dashboardModels.find(m => m.slug === blindModelB)?.name}!</span>
          ) : (
            <span>
              🏆 {dashboardModels.find(m => m.slug === (blindWinner === 'model_a' ? blindModelA : blindModelB))?.name} won this round!
            </span>
          )}
        </div>
      )}
    </main>
  );
}
