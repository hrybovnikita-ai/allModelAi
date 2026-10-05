import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { nextLessonId, trainEndpointForLesson } from '../../data/aiTrainingNav';
import LossChart from './LossChart';
import RegressionPlot from './RegressionPlot';
import AiTutorPanel from './AiTutorPanel';
import DeepResearchButton from './DeepResearchButton';
import './AiTraining.css';

const CONTENT_BLOCKS = {
  'python-for-ai': {
    body: 'Python is the default language for AI because libraries like NumPy, pandas, scikit-learn, and PyTorch are mature and readable. You write data as arrays, define models as functions or classes, and iterate in notebooks or scripts.',
    bullets: ['Variables hold tensors, arrays, and batches', 'Functions encode forward passes and losses', 'Notebooks help you visualize training'],
  },
  'numpy-basics': {
    body: 'NumPy ndarrays store numeric data efficiently. Machine learning relies on vectorized operations instead of Python loops for speed.',
    bullets: ['Shape and dtype matter', 'Broadcasting applies ops across dimensions', 'Gradients use element-wise math on arrays'],
  },
  'loss-functions': {
    body: 'A loss function scores how wrong predictions are. Regression often uses mean squared error (MSE). Classification uses cross-entropy to penalize confident wrong labels.',
    bullets: ['Lower loss is better during training', 'MSE: mean((ŷ − y)²)', 'Cross-entropy for probability outputs'],
  },
  'model-evaluation': {
    body: 'Split data into train, validation, and test sets. Train fits parameters; validation tunes hyperparameters; test estimates real-world performance once.',
    bullets: ['Overfitting: great train, poor validation', 'Underfitting: poor everywhere', 'Never tune on the test set'],
  },
};

export default function LessonPage() {
  const { lessonId } = useParams();
  const [lesson, setLesson] = useState(null);
  const [catalogLessons, setCatalogLessons] = useState([]);
  const [progressPct, setProgressPct] = useState(0);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [trainResult, setTrainResult] = useState(null);
  const [error, setError] = useState('');

  const [learningRate, setLearningRate] = useState(0.01);
  const [epochs, setEpochs] = useState(500);
  const [initialWeight, setInitialWeight] = useState(0);
  const [initialBias, setInitialBias] = useState(0);

  const loadLesson = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/ai-training/lessons/${encodeURIComponent(lessonId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || 'Lesson not found');
        setLesson(null);
        return;
      }
      setLesson(data.lesson);
      if (data.progress) {
        setProgressPct(Math.round((data.progress.progress || 0) * 100));
      }
      const catalogRes = await apiFetch('/api/ai-training/lessons');
      if (catalogRes.ok) {
        const catalog = await catalogRes.json();
        setCatalogLessons(catalog.lessons || []);
        const prog = (catalog.progress || []).find((p) => p.lessonId === lessonId);
        if (prog) setProgressPct(Math.round((prog.progress || 0) * 100));
      }
    } catch (e) {
      setError(e.message || 'Failed to load lesson');
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    void loadLesson();
  }, [loadLesson]);

  const trainEndpoint = useMemo(() => trainEndpointForLesson(lesson), [lesson]);
  const isLab = Boolean(trainEndpoint);
  const nextId = useMemo(() => nextLessonId(lessonId, catalogLessons), [lessonId, catalogLessons]);
  const content = CONTENT_BLOCKS[lessonId];

  const runTraining = async () => {
    if (!trainEndpoint) return;
    setTraining(true);
    setError('');
    setTrainResult(null);
    try {
      const res = await apiFetch(trainEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learningRate,
          epochs,
          initialWeight,
          initialBias,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError('Sign in to run training experiments.');
        return;
      }
      if (!res.ok) {
        setError(data.message || 'Training failed');
        return;
      }
      setTrainResult(data);
      setProgressPct(100);
    } catch (e) {
      setError(e.message || 'Training error');
    } finally {
      setTraining(false);
    }
  };

  const latestHistory = trainResult?.history || [];
  const latestStep = latestHistory[latestHistory.length - 1];

  if (loading) {
    return (
      <div className="py-lab-container">
        <p className="at-muted at-page">Loading lesson…</p>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="py-lab-container">
        <p className="at-error at-page">{error || 'Lesson not found'}</p>
        <Link to="/ai-training" className="py-btn-nav at-page">
          ← Course
        </Link>
      </div>
    );
  }

  return (
    <div className="py-lab-container">
      <header className="py-lab-header">
        <div className="py-lab-brand">
          <Link to="/ai-training" className="brand-logo">
            AI Training
          </Link>
          <span className="brand-tag">{lesson.title}</span>
        </div>
        <nav className="py-lab-nav">
          <Link to="/python-ai" className="py-btn-nav">
            PyTorch Lab
          </Link>
        </nav>
      </header>

      <div className="at-page">
        <p className="at-muted">
          <Link to="/ai-training">AI Training</Link> / {lesson.title}
        </p>
        <h1>{lesson.title}</h1>
        <div className="at-progress-bar" aria-label="Lesson progress">
          <div className="at-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="at-muted">Progress: {progressPct}%</p>
        <p>{lesson.summary}</p>
        {lesson.equation && (
          <p className="at-code" style={{ marginTop: 12 }}>
            {lesson.equation}
          </p>
        )}
      </div>

      <div className="at-page at-lesson-layout">
        <div>
          {content && (
            <section className="at-card" style={{ marginBottom: 16 }}>
              <h3>What you will learn</h3>
              <p>{content.body}</p>
              <ul>
                {content.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          )}

          {isLab && (
            <section className="at-card">
              <h3>Interactive lab</h3>
              <p className="at-muted">
                Real {lesson.id === 'pytorch-intro' ? 'PyTorch' : 'NumPy'} training on the server — adjust hyperparameters and watch loss and the regression line.
              </p>
              <div className="at-lab-controls">
                <label>
                  Learning rate
                  <input
                    type="number"
                    step="0.001"
                    min="0.000001"
                    max="1"
                    value={learningRate}
                    onChange={(e) => setLearningRate(Number(e.target.value))}
                  />
                </label>
                <label>
                  Epochs
                  <input
                    type="number"
                    min="1"
                    max="2000"
                    value={epochs}
                    onChange={(e) => setEpochs(Number(e.target.value))}
                  />
                </label>
                {lesson.id !== 'pytorch-intro' && (
                  <>
                    <label>
                      Initial weight
                      <input
                        type="number"
                        step="0.1"
                        value={initialWeight}
                        onChange={(e) => setInitialWeight(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Initial bias
                      <input
                        type="number"
                        step="0.1"
                        value={initialBias}
                        onChange={(e) => setInitialBias(Number(e.target.value))}
                      />
                    </label>
                  </>
                )}
              </div>
              <button type="button" className="at-btn" onClick={runTraining} disabled={training}>
                {training ? 'Training…' : '▶ Train model'}
              </button>
              {error && <p className="at-error">{error}</p>}

              {trainResult?.ok && (
                <>
                  <h4 style={{ marginTop: 20 }}>Training</h4>
                  {latestStep && (
                    <p className="at-muted">
                      Epoch {latestStep.epoch} / {epochs} — Loss: {latestStep.loss?.toFixed?.(4) ?? latestStep.loss}
                    </p>
                  )}
                  <LossChart history={latestHistory} width={480} height={160} />
                  <RegressionPlot
                    scatter={trainResult.scatter}
                    lineBefore={trainResult.lineBefore}
                    lineAfter={trainResult.lineAfter}
                    width={480}
                    height={220}
                  />
                  <div className="at-metrics">
                    <div className="at-metric">
                      <span>Weight</span>
                      <strong>{trainResult.finalWeight?.toFixed?.(4)}</strong>
                    </div>
                    <div className="at-metric">
                      <span>Bias</span>
                      <strong>{trainResult.finalBias?.toFixed?.(4)}</strong>
                    </div>
                    <div className="at-metric">
                      <span>Final loss</span>
                      <strong>{trainResult.finalLoss?.toFixed?.(4)}</strong>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {(trainResult?.pythonCode || lesson.status === 'planned') && (
            <section className="at-card" style={{ marginTop: 16 }}>
              <h3>Python code</h3>
              {trainResult?.pythonCode ? (
                <pre className="at-code">{trainResult.pythonCode}</pre>
              ) : (
                <p className="at-muted">Coming in a later phase — architecture is reserved in the course catalog.</p>
              )}
            </section>
          )}
        </div>

        <div>
          <AiTutorPanel lesson={lesson} />
          <section className="at-card" style={{ marginTop: 16 }}>
            <h3>Deep Research</h3>
            <DeepResearchButton lesson={lesson} />
          </section>
        </div>
      </div>

      <footer className="at-page at-footer-nav">
        <Link to="/ai-training" className="py-btn-nav">
          ← All lessons
        </Link>
        {nextId && (
          <Link to={`/ai-training/${nextId}`} className="py-btn-nav primary">
            Next lesson →
          </Link>
        )}
      </footer>
    </div>
  );
}
