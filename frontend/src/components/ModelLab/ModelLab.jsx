import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { AllModelAILogoMark } from '../AllModelAILogo/AllModelAILogo';
import '../AiTraining/AiTraining.css';
import './ModelLab.css';

const MODEL_CARDS = [
  { id: 'linear-regression', title: 'Linear Regression', blurb: 'Learn y ≈ 3x + 2 with gradient descent (PyTorch).' },
  { id: 'logistic-regression', title: 'Logistic Regression', blurb: 'Binary classification with BCE loss.' },
  { id: 'neural-network', title: 'Neural Network', blurb: 'Small MLP: Linear → ReLU → Linear.' },
  { id: 'sklearn-linear-regression', title: 'Linear (scikit-learn)', blurb: 'Closed-form fit with train/validation MSE.' },
  { id: 'sklearn-logistic-regression', title: 'Logistic (scikit-learn)', blurb: 'Binary classifier with validation accuracy.' },
  { id: 'openai', title: 'OpenAI', blurb: 'API inference only — not local foundation-model training.' },
];

const CODE_SAMPLES = {
  'linear-regression': `model = nn.Linear(1, 1)
for epoch in range(epochs):
    pred = model(x)
    loss = criterion(pred, y)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()`,
  'logistic-regression': `model = nn.Linear(2, 1)
loss = BCEWithLogitsLoss()(model(x), y)`,
  'neural-network': `model = nn.Sequential(
    nn.Linear(2, 16), nn.ReLU(),
    nn.Linear(16, 3))`,
};

function MetricChart({ history = [], label = 'Loss', color = '#818cf8' }) {
  if (!history.length) return null;
  const w = 360;
  const h = 140;
  const max = Math.max(...history, 1e-9);
  const min = Math.min(...history);
  const range = Math.max(max - min, 1e-9);
  const points = history.map((v, i) => {
    const x = (i / Math.max(history.length - 1, 1)) * (w - 8) + 4;
    const y = h - 6 - ((v - min) / range) * (h - 12);
    return `${x},${y}`;
  }).join(' ');
  const gridY = [0.25, 0.5, 0.75].map((t) => h - 6 - t * (h - 12));
  return (
    <div className="mlab-chart-wrap">
      <small>{label}</small>
      <svg className="mlab-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} chart`}>
        {gridY.map((y) => (
          <line key={y} className="mlab-chart-grid" x1={4} x2={w - 4} y1={y} y2={y} />
        ))}
        <polyline className="mlab-chart-line" fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
    </div>
  );
}

export default function ModelLab() {
  const [selected, setSelected] = useState('linear-regression');
  const [epochs, setEpochs] = useState(100);
  const [learningRate, setLearningRate] = useState(0.01);
  const [batchSize, setBatchSize] = useState(32);
  const [runId, setRunId] = useState('');
  const [run, setRun] = useState(null);
  const [error, setError] = useState('');
  const [predictInput, setPredictInput] = useState('10');
  const [predictOut, setPredictOut] = useState(null);
  const [openAiPrompt, setOpenAiPrompt] = useState('Explain gradient descent in one paragraph.');
  const [openAiReply, setOpenAiReply] = useState('');
  const pollRef = useRef(null);

  const isLocalModel = selected !== 'openai';
  const supportsPredict = !selected.startsWith('sklearn-') && selected !== 'openai';
  const progressPct = useMemo(() => {
    if (!run?.totalEpochs) return 0;
    return Math.min(100, Math.round((run.currentEpoch / run.totalEpochs) * 100));
  }, [run]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchRun = useCallback(async (id) => {
    const res = await apiFetch(`/api/training/${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Could not load training status');
    setRun(data);
    return data;
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  useEffect(() => {
    if (!runId) return undefined;
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const data = await fetchRun(runId);
        if (data.status === 'completed' || data.status === 'failed') stopPoll();
      } catch (e) {
        setError(e.message);
        stopPoll();
      }
    }, 600);
    return stopPoll;
  }, [runId, fetchRun, stopPoll]);

  async function startTraining() {
    setError('');
    setRun(null);
    setPredictOut(null);
    setRunId('');
    try {
      const res = await apiFetch('/api/training/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelType: selected,
          epochs: Number(epochs),
          learningRate: Number(learningRate),
          batchSize: Number(batchSize),
          dataPoints: 120,
          seed: 42,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Training failed to start');
      setRunId(data.runId);
      await fetchRun(data.runId);
    } catch (e) {
      setError(e.message);
    }
  }

  async function runPredict() {
    if (!runId) return;
    setError('');
    try {
      const inputs = predictInput.split(/[,\s]+/).filter(Boolean).map(Number);
      const res = await apiFetch(`/api/training/${encodeURIComponent(runId)}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Prediction failed');
      setPredictOut(data);
    } catch (e) {
      setError(e.message);
    }
  }

  async function askOpenAi() {
    setError('');
    setOpenAiReply('');
    try {
      const res = await apiFetch('/api/training/openai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: openAiPrompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'OpenAI unavailable');
      setOpenAiReply(data.text || '');
    } catch (e) {
      setError(e.message);
    }
  }

  const lossHistory = run?.lossHistory || run?.result?.lossHistory || [];
  const valHistory = run?.validationLossHistory || run?.result?.validationLossHistory || [];
  const accHistory = run?.accuracyHistory || run?.result?.accuracyHistory || [];
  const checkpointPath = run?.result?.storagePath || run?.checkpointPath;
  const completed = run?.status === 'completed';
  const training = run?.status === 'training' || run?.status === 'queued';

  return (
    <main className="mlab-page">
      <header className="mlab-header">
        <Link to="/" className="mlab-brand"><AllModelAILogoMark />AllModelAI</Link>
        <nav>
          <Link to="/ai-training">AI Training Course</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>
      <section className="mlab-hero">
        <p className="mlab-eyebrow">Model Lab</p>
        <h1>AI Training Lab</h1>
        <p className="mlab-hero-lead">Train, visualize and test machine-learning models locally with PyTorch. OpenAI is API inference only.</p>
      </section>

      <div className="mlab-cards">
        {MODEL_CARDS.map((card) => (
          <button
            type="button"
            key={card.id}
            className={`mlab-card ${selected === card.id ? 'selected' : ''}`}
            onClick={() => { setSelected(card.id); setRun(null); setRunId(''); setError(''); }}
          >
            <strong>{card.title}</strong>
            <span>{card.blurb}</span>
          </button>
        ))}
      </div>

      {error && <p className="mlab-error" role="alert">{error}</p>}

      {isLocalModel ? (
        <div className="mlab-grid">
          <section className="mlab-panel">
            <h2>Training configuration</h2>
            <label>Model<input readOnly value={MODEL_CARDS.find((c) => c.id === selected)?.title || selected} /></label>
            <label>Epochs<input type="number" min={5} max={500} value={epochs} onChange={(e) => setEpochs(e.target.value)} /></label>
            <label>Learning Rate<input type="number" step="0.001" min={0.00001} max={1} value={learningRate} onChange={(e) => setLearningRate(e.target.value)} /></label>
            <label>Batch Size<input type="number" min={1} max={128} value={batchSize} onChange={(e) => setBatchSize(e.target.value)} /></label>
            <button type="button" className="mlab-btn primary" disabled={training} onClick={startTraining}>
              {training ? 'Training…' : 'Start Training'}
            </button>
            <details className="mlab-edu">
              <summary>What is gradient descent?</summary>
              <p>Gradient descent adjusts weights using the loss gradient so predictions improve each epoch.</p>
            </details>
            <details className="mlab-edu">
              <summary>View Python code</summary>
              <pre>{CODE_SAMPLES[selected]}</pre>
            </details>
          </section>

          <section
            className={`mlab-panel mlab-progress${training ? ' is-training' : ''}${completed ? ' is-complete' : ''}`}
          >
            <h2>{training ? `Training ${MODEL_CARDS.find((c) => c.id === selected)?.title}` : completed ? 'Training complete' : 'Progress'}</h2>
            {run && (
              <>
                <div className="mlab-epoch-row">
                  <span>
                    Epoch <strong>{run.currentEpoch || 0}</strong> / {run.totalEpochs || epochs}
                  </span>
                  <span className="mlab-epoch-pct">{progressPct}%</span>
                </div>
                <div className="mlab-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${progressPct}%` }} />
                </div>
                <ul className="mlab-stats">
                  <li><span>Loss</span><strong>{run.loss != null ? Number(run.loss).toFixed(4) : '—'}</strong></li>
                  <li><span>Learning rate</span><strong>{learningRate}</strong></li>
                  {(run.validationLoss != null || run.result?.validationLoss != null) && (
                    <li><span>Validation loss</span><strong>{Number(run.validationLoss ?? run.result?.validationLoss).toFixed(4)}</strong></li>
                  )}
                  {run.accuracy != null && <li><span>Accuracy</span><strong>{(run.accuracy * 100).toFixed(1)}%</strong></li>}
                  {run.weight != null && <li><span>Weight</span><strong>{Number(run.weight).toFixed(3)}</strong></li>}
                  {run.bias != null && <li><span>Bias</span><strong>{Number(run.bias).toFixed(3)}</strong></li>}
                  <li><span>Status</span><strong className="mlab-status-badge">{run.status}</strong></li>
                </ul>
                <MetricChart history={lossHistory} label="Training loss vs epoch" />
                {valHistory.length > 0 && <MetricChart history={valHistory} label="Validation loss vs epoch" color="#f472b6" />}
                {accHistory.length > 0 && <MetricChart history={accHistory} label="Accuracy vs epoch" color="#34d399" />}
                {completed && (
                  <div className="mlab-done">
                    <p>Final loss: {run.result?.finalLoss?.toFixed?.(4) ?? run.loss}</p>
                    {run.result?.finalAccuracy != null && <p>Final accuracy: {(run.result.finalAccuracy * 100).toFixed(1)}%</p>}
                    {run.result?.validationLoss != null && <p>Final validation loss: {Number(run.result.validationLoss).toFixed(4)}</p>}
                    {checkpointPath && (
                      <p className="mlab-checkpoint">
                        <span className="mlab-checkpoint-label">Checkpoint</span>
                        <code className="mlab-checkpoint-value">{checkpointPath}</code>
                      </p>
                    )}
                    <div className="mlab-actions">
                      <button type="button" className="mlab-btn" onClick={() => { setRun(null); setRunId(''); }}>Train again</button>
                    </div>
                  </div>
                )}
              </>
            )}
            {!run && (
              <p className="mlab-empty-state">
                Start training to see live metrics, loss curves, and checkpoints from the Python service.
              </p>
            )}
          </section>

          {completed && supportsPredict && (
            <section className="mlab-panel mlab-panel-test">
              <h2>Test model</h2>
              <p className="mlab-muted mlab-empty-hint">Linear: one number (x). Classification / MLP: two features comma-separated.</p>
              <label>Input<input value={predictInput} onChange={(e) => setPredictInput(e.target.value)} placeholder="10 or 0.5, -1.2" /></label>
              <button type="button" className="mlab-btn primary" onClick={runPredict}>Predict</button>
              {predictOut && (
                <p className="mlab-predict">
                  Prediction: <strong>{String(predictOut.prediction)}</strong>
                  {predictOut.confidence != null && <> · confidence {Number(predictOut.confidence).toFixed(3)}</>}
                </p>
              )}
            </section>
          )}
        </div>
      ) : (
        <section className="mlab-panel mlab-openai">
          <h2>OpenAI API (inference)</h2>
          <p className="mlab-muted">This calls OpenAI servers. It does not train GPT weights on your machine.</p>
          <label>Prompt<textarea rows={4} value={openAiPrompt} onChange={(e) => setOpenAiPrompt(e.target.value)} /></label>
          <button type="button" className="mlab-btn primary" onClick={askOpenAi}>Send to OpenAI</button>
          {openAiReply && <pre className="mlab-openai-reply">{openAiReply}</pre>}
        </section>
      )}
    </main>
  );
}
