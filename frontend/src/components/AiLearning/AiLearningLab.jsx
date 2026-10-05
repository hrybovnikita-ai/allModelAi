import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import '../AiTraining/AiTraining.css';
import './AiLearningLab.css';

const TOPICS = [
  'NumPy', 'Pandas', 'scikit-learn', 'Keras', 'PyTorch',
  'Linear Regression', 'Gradient Descent', 'Loss', 'Learning Rate', 'Neural Networks', 'OpenAI API',
];

function LossChart({ history = [] }) {
  if (!history.length) return null;
  const w = 320;
  const h = 120;
  const max = Math.max(...history, 1e-6);
  const min = Math.min(...history);
  const range = Math.max(max - min, 1e-6);
  const points = history.map((v, i) => {
    const x = (i / Math.max(history.length - 1, 1)) * (w - 8) + 4;
    const y = h - 4 - ((v - min) / range) * (h - 8);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg className="ail-loss-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Training loss chart">
      <polyline fill="none" stroke="var(--py-accent, #7165ef)" strokeWidth="2" points={points} />
    </svg>
  );
}

export default function AiLearningLab() {
  const [lessons, setLessons] = useState([]);
  const [selected, setSelected] = useState('linear-regression-numpy');
  const [epochs, setEpochs] = useState(150);
  const [learningRate, setLearningRate] = useState(0.05);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [trainingId, setTrainingId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/ai/lessons');
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.lessons) setLessons(data.lessons);
      } catch {
        /* catalog optional when Python offline */
      }
    })();
  }, []);

  const lesson = useMemo(
    () => lessons.find((l) => l.id === selected) || { id: selected, title: selected, trainKind: 'linear-regression' },
    [lessons, selected],
  );

  const trainPath = useMemo(() => {
    const kind = lesson.trainKind || 'linear-regression';
    if (kind === 'gradient-descent') return '/api/ai/train/gradient-descent';
    if (kind === 'pytorch-linear') return '/api/ai/train/pytorch-linear';
    return '/api/ai/train/linear-regression';
  }, [lesson]);

  async function startTraining() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await apiFetch(trainPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epochs: Number(epochs),
          learning_rate: Number(learningRate),
          seed: 42,
          data_points: 80,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Training failed');
        return;
      }
      setResult(data);
      if (data.trainingId) setTrainingId(data.trainingId);
    } catch (e) {
      setError(e.message || 'Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-lab-container ail-root">
      <header className="py-lab-header">
        <div className="py-lab-brand">
          <Link to="/" className="brand-logo">AllModelAI</Link>
          <span className="brand-tag">AI Learning Lab</span>
        </div>
        <nav className="py-lab-nav">
          <Link to="/ai-training" className="py-btn-nav">AI Training Course</Link>
          <Link to="/python-ai" className="py-btn-nav">PyTorch Lab</Link>
          <Link to="/chat" className="py-btn-nav primary">Chat</Link>
        </nav>
      </header>

      <section className="at-page at-hero">
        <h1>Machine Learning Learning Lab</h1>
        <p>
          Explore NumPy, Pandas, scikit-learn, PyTorch, and training fundamentals. Experiments run on the
          server through the Node gateway — your browser never talks to Python directly.
        </p>
        <div className="ail-topics">
          {TOPICS.map((t) => (
            <span key={t} className="ail-topic-pill">{t}</span>
          ))}
        </div>
      </section>

      <section className="at-page ail-grid">
        <div className="ail-panel">
          <h2>Lessons</h2>
          <ul className="ail-lesson-list">
            {(lessons.length ? lessons : [{ id: 'linear-regression-numpy', title: 'Linear Regression (NumPy)', trainable: true }]).map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className={selected === l.id ? 'active' : ''}
                  onClick={() => setSelected(l.id)}
                >
                  {l.title}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="ail-panel">
          <h2>Training experiment</h2>
          <label className="ail-field">
            Epochs
            <input type="number" min={5} max={2000} value={epochs} onChange={(e) => setEpochs(e.target.value)} />
          </label>
          <label className="ail-field">
            Learning rate
            <input type="number" step="0.001" min={0.00001} max={1} value={learningRate} onChange={(e) => setLearningRate(e.target.value)} />
          </label>
          <button type="button" className="py-btn primary" disabled={busy} onClick={startTraining}>
            {busy ? 'Training…' : 'Start Training'}
          </button>
          {error && <p className="at-error">{error}</p>}
          {result && (
            <div className="ail-result">
              <p><strong>Status:</strong> completed</p>
              <p><strong>Engine:</strong> {result.engine}</p>
              <p><strong>Final loss:</strong> {result.finalLoss?.toFixed?.(6) ?? result.finalLoss}</p>
              <p><strong>Weight / bias:</strong> {result.finalWeight?.toFixed?.(4)} / {result.finalBias?.toFixed?.(4)}</p>
              {trainingId && <p><strong>Job id:</strong> <code>{trainingId}</code></p>}
              <LossChart history={result.lossHistory || []} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
