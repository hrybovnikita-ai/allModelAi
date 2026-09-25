import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './PythonAILab.css';

const SAMPLE_PROMPTS = [
  'How does AI learn through backpropagation?',
  'Hello! How are you today?',
  'Help me write a Python function with PyTorch.',
  'Explain calculus and derivatives in neural networks.',
  'Tell me a creative sci-fi story about intelligent machines.',
  'What device and hardware are you running on?',
];

export default function PythonAILab() {
  const [status, setStatus] = useState(null);
  const [training, setTraining] = useState(false);
  const [epochs, setEpochs] = useState(40);
  const [lr, setLr] = useState(0.005);
  const [batchSize, setBatchSize] = useState(16);
  const [openaiAugment, setOpenaiAugment] = useState(false);
  const [openaiStatus, setOpenaiStatus] = useState(null);

  // Inference state
  const [promptText, setPromptText] = useState('How does AI learn through backpropagation?');
  const [predicting, setPredicting] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const pollIntervalRef = useRef(null);
  const logsEndRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ai-python/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setTraining(Boolean(data.is_training));
        if (data.openai) setOpenaiStatus(data.openai);
      }
    } catch (e) {
      console.warn('Failed to fetch PyTorch AI status:', e);
    }
  }, []);

  const fetchOpenAiStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ai-python/openai/status');
      if (res.ok) setOpenaiStatus(await res.json());
    } catch (e) {
      console.warn('OpenAI status unavailable:', e);
    }
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchStatus();
      void fetchOpenAiStatus();
    }, 0);

    pollIntervalRef.current = setInterval(() => {
      void fetchStatus();
    }, 2000);

    return () => {
      clearTimeout(initialTimer);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchStatus, fetchOpenAiStatus]);

  useEffect(() => {
    if (!training) return undefined;

    const fastInterval = setInterval(() => {
      void fetchStatus();
    }, 800);

    return () => clearInterval(fastInterval);
  }, [training, fetchStatus]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [status?.logs]);

  const handleStartTraining = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setTraining(true);
    try {
      const res = await apiFetch('/api/ai-python/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epochs,
          lr,
          batchSize,
          openaiAugment,
          openaiSamplesPerClass: 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Training failed to initiate');
      setSuccessMsg(`AI Learning session started: ${epochs} epochs.`);
      void fetchStatus();
    } catch (err) {
      setErrorMsg(err.message);
      setTraining(false);
    }
  };

  const handleOpenAiAugmentOnly = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiFetch('/api/ai-python/openai/augment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samplesPerClass: 2 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Augment failed');
      if (!data.ok) throw new Error(data.error || 'OpenAI augment failed');
      setSuccessMsg(`OpenAI added ${data.added || 0} training samples (${data.total_samples || '—'} total).`);
      void fetchStatus();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleResetModel = async () => {
    if (!window.confirm('Are you sure you want to reset PyTorch weights and training history?')) return;
    try {
      const res = await apiFetch('/api/ai-python/reset', { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('PyTorch model weights reset successfully.');
        void fetchStatus();
      }
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handlePredict = async (textToPredict) => {
    const text = textToPredict || promptText;
    if (!text.trim()) return;
    setErrorMsg('');
    setPredicting(true);
    try {
      const res = await apiFetch('/api/ai-python/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Prediction failed');
      setPredictionResult(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setPredicting(false);
    }
  };

  return (
    <div className="py-lab-container">
      {/* Top Navbar */}
      <header className="py-lab-header">
        <div className="py-lab-brand">
          <Link to="/dashboard" className="brand-logo">
            <span className="brand-badge">PyTorch</span>
            <strong>AllModelAI</strong>
          </Link>
          <span className="brand-tag">AI Learning Lab</span>
        </div>
        <div className="py-lab-nav">
          <Link to="/chat?model=ai_python" className="py-btn-nav">
            Open in Chat
          </Link>
          <Link to="/explore" className="py-btn-nav">
            Model Explorer
          </Link>
          <Link to="/dashboard" className="py-btn-nav primary">
            Dashboard
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-lab-hero">
        <div className="hero-badge">
          <span className="pulse-dot"></span>
          Python & PyTorch Neural Engine
        </div>
        <h1>Deep Learning & Neural Network Studio</h1>
        <p>
          Train a custom neural network locally on your machine with PyTorch backpropagation,
          gradient descent, real-time loss tracking, and instant offline inference.
        </p>

        {/* Global status pills */}
        <div className="py-status-row">
          <div className="status-pill">
            <label>ENGINE</label>
            <strong>PyTorch {status?.pytorch_version || '2.9.1'}</strong>
          </div>
          <div className="status-pill">
            <label>DEVICE</label>
            <strong className="accent-device">{(status?.device || 'CPU').toUpperCase()}</strong>
          </div>
          <div className="status-pill">
            <label>WEIGHTS</label>
            <strong>{status?.model_file_exists ? 'ai_model.pth (Saved)' : 'Untrained'}</strong>
          </div>
          <div className="status-pill">
            <label>PARAMETERS</label>
            <strong>{status?.total_parameters?.toLocaleString() || '13,127'}</strong>
          </div>
          <div className="status-pill">
            <label>STATE</label>
            <strong className={training ? 'state-training' : 'state-ready'}>
              {training ? 'Training...' : 'Ready'}
            </strong>
          </div>
          <div className="status-pill">
            <label>TRAINING SET</label>
            <strong>{status?.training_samples ?? '—'} samples</strong>
          </div>
          <div className="status-pill">
            <label>OPENAI</label>
            <strong className={openaiStatus?.configured ? 'state-ready' : ''}>
              {openaiStatus?.configured ? `Connected · ${openaiStatus.model}` : 'Not configured'}
            </strong>
          </div>
        </div>
      </section>

      {/* Notification banners */}
      {errorMsg && <div className="py-alert error">{errorMsg}</div>}
      {successMsg && <div className="py-alert success">{successMsg}</div>}

      <div className="py-lab-grid">
        {/* Left Column: Learning & Training Control Panel */}
        <div className="py-card training-card">
          <div className="card-header">
            <div>
              <h2>AI Learning Control Center</h2>
              <p>Configure hyperparameters and run backpropagation across training epochs</p>
            </div>
            <button
              className="py-btn-reset"
              onClick={handleResetModel}
              title="Reset model weights"
            >
              Reset Weights
            </button>
          </div>

          <div className="py-controls-grid">
            <div className="control-group">
              <label>
                <span>Training Epochs:</span>
                <strong>{epochs}</strong>
              </label>
              <input
                type="range"
                min="10"
                max="200"
                step="5"
                value={epochs}
                disabled={training}
                onChange={(e) => setEpochs(Number(e.target.value))}
              />
            </div>

            <div className="control-group">
              <label>Learning Rate (lr):</label>
              <select
                value={lr}
                disabled={training}
                onChange={(e) => setLr(Number(e.target.value))}
              >
                <option value={0.001}>0.001 (Fine / Gentle)</option>
                <option value={0.005}>0.005 (Recommended)</option>
                <option value={0.01}>0.010 (Fast)</option>
                <option value={0.02}>0.020 (Aggressive)</option>
              </select>
            </div>

            <div className="control-group">
              <label>Batch Size:</label>
              <select
                value={batchSize}
                disabled={training}
                onChange={(e) => setBatchSize(Number(e.target.value))}
              >
                <option value={8}>8 samples</option>
                <option value={16}>16 samples (Balanced)</option>
                <option value={32}>32 samples (Fast)</option>
              </select>
            </div>
          </div>

          <label className="py-openai-toggle">
            <input
              type="checkbox"
              checked={openaiAugment}
              disabled={training || !openaiStatus?.configured}
              onChange={(e) => setOpenaiAugment(e.target.checked)}
            />
            <span>
              Augment dataset with OpenAI before training
              {!openaiStatus?.configured && ' (set OPENAI_API_KEY in backend .env)'}
            </span>
          </label>
          <button
            type="button"
            className="py-btn-augment"
            disabled={training || !openaiStatus?.configured}
            onClick={handleOpenAiAugmentOnly}
          >
            Generate labeled samples via OpenAI
          </button>

          <button
            className={`py-btn-train ${training ? 'is-loading' : ''}`}
            onClick={handleStartTraining}
            disabled={training}
          >
            {training ? (
              <>
                <span className="spinner"></span>
                Learning in Progress... (Epoch {status?.current_epoch || 0}/{status?.total_epochs || epochs})
              </>
            ) : (
              '⚡ Start PyTorch AI Learning'
            )}
          </button>

          {/* Progress & Loss Metrics */}
          <div className="metrics-box">
            <div className="metric-item">
              <small>CURRENT PROGRESS</small>
              <h3>{status?.progress_percent || (status?.model_file_exists ? 100 : 0)}%</h3>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${status?.progress_percent || (status?.model_file_exists ? 100 : 0)}%` }}
                ></div>
              </div>
            </div>

            <div className="metric-row">
              <div className="metric-stat">
                <small>LAST LOSS</small>
                <span>{status?.last_loss != null ? status.last_loss.toFixed(4) : '--'}</span>
              </div>
              <div className="metric-stat">
                <small>BEST LOSS</small>
                <span>{status?.best_loss != null ? status.best_loss.toFixed(4) : '--'}</span>
              </div>
              <div className="metric-stat">
                <small>ACCURACY</small>
                <span className="accent-acc">
                  {status?.last_accuracy != null ? `${status.last_accuracy.toFixed(1)}%` : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Loss Curve Visualization */}
          {status?.gradient_history && status.gradient_history.length > 1 && (
            <div className="chart-container">
              <label className="chart-label">LINEAR LAYER GRADIENT L2 (BACKPROP / AUTograd)</label>
              <div className="loss-bars">
                {status.gradient_history.slice(-30).map((entry, i) => {
                  const values = status.gradient_history.slice(-30).map((e) => e.total_linear_grad_l2 || 0);
                  const maxGrad = Math.max(...values, 0.001);
                  const heightPercent = Math.max(
                    8,
                    Math.min(100, ((entry.total_linear_grad_l2 || 0) / maxGrad) * 100)
                  );
                  return (
                    <div
                      key={`grad-${i}`}
                      className="loss-bar-col grad-bar"
                      title={`Epoch ${entry.epoch}: grad L2 ${entry.total_linear_grad_l2}`}
                    >
                      <div className="loss-bar grad-bar-fill" style={{ height: `${heightPercent}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {status?.loss_history && status.loss_history.length > 1 && (
            <div className="chart-container">
              <label className="chart-label">LOSS REDUCTION CURVE (PYTORCH GRADIENT DESCENT)</label>
              <div className="loss-bars">
                {status.loss_history.slice(-30).map((lossVal, i) => {
                  const maxLoss = Math.max(...status.loss_history.slice(-30), 0.1);
                  const heightPercent = Math.max(8, Math.min(100, (lossVal / maxLoss) * 100));
                  return (
                    <div
                      key={i}
                      className="loss-bar-col"
                      title={`Epoch ${i + 1}: Loss ${lossVal}`}
                    >
                      <div className="loss-bar" style={{ height: `${heightPercent}%` }}></div>
                    </div>
                  );
                })}
              </div>
              <div className="chart-axis">
                <span>Initial Epoch</span>
                <span>Converged Loss</span>
              </div>
            </div>
          )}

          {/* Terminal Logs */}
          <div className="terminal-box">
            <div className="terminal-header">
              <span className="dot red"></span>
              <span className="dot yellow"></span>
              <span className="dot green"></span>
              <span className="terminal-title">PyTorch Training Console</span>
            </div>
            <div className="terminal-body">
              {status?.logs && status.logs.length > 0 ? (
                status.logs.map((log, index) => (
                  <div key={index} className="log-line">
                    {log}
                  </div>
                ))
              ) : (
                <div className="log-line text-muted">Ready to train. Press Start AI Learning above.</div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Prediction Playground & Architecture */}
        <div className="py-card playground-card">
          <div className="card-header">
            <div>
              <h2>Live Inference Playground</h2>
              <p>Test inputs against your trained PyTorch neural network</p>
            </div>
          </div>

          {/* Sample prompt chips */}
          <div className="samples-section">
            <small>QUICK TEST SAMPLES:</small>
            <div className="sample-chips">
              {SAMPLE_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  className="sample-chip"
                  onClick={() => {
                    setPromptText(prompt);
                    handlePredict(prompt);
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Test Input area */}
          <div className="prompt-input-wrapper">
            <textarea
              className="py-textarea"
              rows={3}
              placeholder="Ask anything or enter test text..."
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePredict();
                }
              }}
            />
            <button
              className="py-btn-predict"
              onClick={() => handlePredict()}
              disabled={predicting || !promptText.trim()}
            >
              {predicting ? 'Evaluating...' : 'Run PyTorch Inference →'}
            </button>
          </div>

          {/* Inference Output */}
          {predictionResult && (
            <div className="prediction-box">
              <div className="pred-top">
                <span className="pred-category-tag">
                  Category: <strong>{predictionResult.predicted_class}</strong>
                </span>
                <span className="pred-confidence-badge">
                  {predictionResult.confidence}% confidence
                </span>
              </div>

              <div className="pred-response">
                <p>{predictionResult.response}</p>
              </div>

              {/* Confidence distribution */}
              {predictionResult.probabilities && (
                <div className="probabilities-section">
                  <small>CLASS ACTIVATION PROBABILITIES (SOFTMAX):</small>
                  <div className="prob-list">
                    {Object.entries(predictionResult.probabilities)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([cls, pct]) => (
                        <div key={cls} className="prob-row">
                          <span className="prob-name">{cls}</span>
                          <div className="prob-bar-track">
                            <div className="prob-bar-fill" style={{ width: `${pct}%` }}></div>
                          </div>
                          <span className="prob-pct">{pct}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="pred-footer">
                <Link to="/chat?model=ai_python" className="chat-link">
                  Continue conversation in AllModelAI Chat →
                </Link>
              </div>
            </div>
          )}

          {/* Neural Architecture Breakdown */}
          <div className="architecture-panel">
            <h3>Neural Network Architecture (AILearningBrain)</h3>
            <div className="arch-layers">
              <div className="layer-chip">
                <span>Input</span>
                <strong>Linear(128 → 64)</strong>
              </div>
              <span className="layer-arrow">↓</span>
              <div className="layer-chip">
                <span>Norm & Activation</span>
                <strong>LayerNorm + ReLU + Dropout(0.15)</strong>
              </div>
              <span className="layer-arrow">↓</span>
              <div className="layer-chip">
                <span>Hidden Layer</span>
                <strong>Linear(64 → 64) + LayerNorm + ReLU</strong>
              </div>
              <span className="layer-arrow">↓</span>
              <div className="layer-chip">
                <span>Output Layer</span>
                <strong>Linear(64 → 7 classes) + Softmax</strong>
              </div>
            </div>
            <div className="arch-specs">
              <span>Optimizer: <b>AdamW (lr={lr})</b></span>
              <span>Scheduler: <b>CosineAnnealingLR</b></span>
              <span>Loss: <b>CrossEntropyLoss</b></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
