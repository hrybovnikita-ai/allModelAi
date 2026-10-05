import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { resolveApiUrl } from '../../lib/apiBase';
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
  const [quotas, setQuotas] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [dataset, setDataset] = useState([]);
  const [newSampleText, setNewSampleText] = useState('');
  const [newSampleLabel, setNewSampleLabel] = useState('greeting');
  const [predictSlot, setPredictSlot] = useState('default');

  const pollIntervalRef = useRef(null);
  const terminalBodyRef = useRef(null);
  const trainStreamRef = useRef(null);

  const backpropPipeline = status?.backprop?.pipeline || [
    'forward_pass',
    'cross_entropy_loss',
    'loss.backward()',
    'linear_layer_gradients',
    'clip_grad_norm_',
    'optimizer.step()',
  ];

  const latestLinearGradients = useMemo(() => {
    const fromStep = status?.last_training_step?.linear_gradients?.layers;
    if (fromStep?.length) return fromStep;
    const history = status?.gradient_history;
    if (!history?.length) return [];
    return history[history.length - 1]?.layers || [];
  }, [status?.last_training_step, status?.gradient_history]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ai-python/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setTraining(Boolean(data.is_training));
        if (data.openai) setOpenaiStatus(data.openai);
        if (data.pytorch_version) setErrorMsg('');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.message || 'PyTorch AI server is unavailable. Install Python + torch or start the backend.');
      }
    } catch (e) {
      console.warn('Failed to fetch PyTorch AI status:', e);
      setErrorMsg('Cannot reach /api/ai-python. Start allModelAi backend (port 5050) and ensure Python is installed.');
    }
  }, []);

  const fetchQuotas = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ai-python/quotas');
      if (res.ok) setQuotas(await res.json());
    } catch {
      /* optional auth */
    }
  }, []);

  const fetchSystemHealth = useCallback(async () => {
    try {
      const res = await apiFetch('/api/system/health');
      if (res.ok) setSystemHealth(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const fetchDataset = useCallback(async () => {
    try {
      const res = await apiFetch('/api/ai-python/dataset');
      if (res.ok) {
        const data = await res.json();
        setDataset(data.samples || []);
      }
    } catch {
      /* ignore */
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
      void fetchQuotas();
      void fetchSystemHealth();
      void fetchDataset();
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
  }, [fetchStatus, fetchOpenAiStatus, fetchQuotas, fetchSystemHealth, fetchDataset]);

  useEffect(() => {
    if (!training) return undefined;

    const fastInterval = setInterval(() => {
      void fetchStatus();
    }, 800);

    return () => clearInterval(fastInterval);
  }, [training, fetchStatus]);

  useEffect(() => {
    if (!training) return;
    const terminal = terminalBodyRef.current;
    if (terminal) {
      terminal.scrollTop = terminal.scrollHeight;
    }
  }, [status?.logs, training]);

  useEffect(() => {
    if (!training) {
      if (trainStreamRef.current) {
        trainStreamRef.current.close();
        trainStreamRef.current = null;
      }
      return undefined;
    }

    const source = new EventSource(resolveApiUrl('/api/ai-python/train/stream'), { withCredentials: true });
    trainStreamRef.current = source;
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data);
        setTraining(Boolean(data.is_training));
        if (data.stream_done) {
          source.close();
          trainStreamRef.current = null;
          setTraining(false);
          void fetchQuotas();
        }
      } catch {
        /* ignore malformed chunks */
      }
    };
    source.onerror = () => {
      source.close();
      trainStreamRef.current = null;
    };

    return () => {
      source.close();
      trainStreamRef.current = null;
    };
  }, [training, fetchQuotas]);

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
      void fetchQuotas();
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
        body: JSON.stringify({ text, slot: predictSlot === 'default' ? undefined : predictSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Prediction failed');
      setPredictionResult(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setPredicting(false);
      void fetchQuotas();
    }
  };

  const handleAddSample = async () => {
    if (!newSampleText.trim()) return;
    try {
      const res = await apiFetch('/api/ai-python/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newSampleText.trim(), label: newSampleLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to add sample');
      setNewSampleText('');
      setSuccessMsg(data.duplicate ? 'Sample already exists in dataset.' : 'Training sample added.');
      void fetchDataset();
      void fetchStatus();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteSample = async (index) => {
    try {
      const res = await apiFetch(`/api/ai-python/dataset/${index}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      void fetchDataset();
      void fetchStatus();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleExportModel = async () => {
    try {
      const res = await apiFetch('/api/ai-python/export');
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `allmodelai-pytorch-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleImportModel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const res = await apiFetch('/api/ai-python/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setSuccessMsg(`Imported weights: ${(data.imported_slots || []).join(', ') || 'none'}`);
      void fetchStatus();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      event.target.value = '';
    }
  };

  const handleSaveSlot = async (slot) => {
    try {
      const res = await apiFetch(`/api/ai-python/models/slot/${slot}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save slot failed');
      setSuccessMsg(`Current weights saved to slot ${slot.toUpperCase()}.`);
      void fetchStatus();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleQueueTrainJob = async () => {
    try {
      const res = await apiFetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pytorch-train',
          payload: { epochs, lr, batchSize, openaiAugment },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Job queue failed');
      setSuccessMsg(`Background job queued: ${data.id}`);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const classOptions = status?.classes || [
    'greeting',
    'ai_learning',
    'coding_help',
    'math_logic',
    'creative_writing',
    'system_info',
    'knowledge',
  ];

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
          <Link to="/ai-training" className="py-btn-nav">
            AI Training Course
          </Link>
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
          <div className="status-pill">
            <label>PYTORCH API</label>
            <strong className={systemHealth?.pytorch?.status === 'ok' ? 'state-ready' : ''}>
              {systemHealth?.pytorch?.status === 'ok' ? 'Healthy' : 'Checking…'}
            </strong>
          </div>
          {quotas?.train && (
            <div className="status-pill">
              <label>TRAIN QUOTA</label>
              <strong>
                {quotas.train.used}/{quotas.train.limit} today
              </strong>
            </div>
          )}
          {status?.early_stopping?.best_val_loss != null && (
            <div className="status-pill">
              <label>BEST VAL LOSS</label>
              <strong>{status.early_stopping.best_val_loss}</strong>
            </div>
          )}
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

          <div className="py-lab-actions-row">
            <button type="button" className="py-btn-secondary" disabled={training} onClick={handleExportModel}>
              Export .pth bundle
            </button>
            <label className="py-btn-secondary file-import">
              Import bundle
              <input type="file" accept="application/json,.json" hidden onChange={handleImportModel} />
            </label>
            <button type="button" className="py-btn-secondary" disabled={training} onClick={() => handleSaveSlot('a')}>
              Save slot A
            </button>
            <button type="button" className="py-btn-secondary" disabled={training} onClick={() => handleSaveSlot('b')}>
              Save slot B
            </button>
            <button type="button" className="py-btn-secondary" disabled={training} onClick={handleQueueTrainJob}>
              Queue background job
            </button>
          </div>

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

          <div className="backprop-panel">
            <div className="backprop-panel-head">
              <h3>Training loop: Linear → Loss → Backward</h3>
              <p>
                PyTorch autograd: forward through nn.Linear layers, CrossEntropyLoss, then loss.backward()
                and linear weight gradients.
              </p>
            </div>
            <ol className="backprop-steps">
              {backpropPipeline.map((step, index) => {
                const activeIndex = training
                  ? Math.min(
                      backpropPipeline.length - 1,
                      Math.floor(((status?.progress_percent || 0) / 100) * backpropPipeline.length)
                    )
                  : status?.last_training_step
                    ? backpropPipeline.indexOf('optimizer.step()')
                    : -1;
                const isActive = index <= activeIndex && (training || status?.last_training_step);
                return (
                  <li key={step} className={isActive ? 'step-done' : ''}>
                    <span className="step-index">{index + 1}</span>
                    <code>{step}</code>
                  </li>
                );
              })}
            </ol>
            <div className="backprop-live">
              <div>
                <small>BATCH LOSS</small>
                <strong>
                  {status?.last_training_step?.loss != null
                    ? status.last_training_step.loss.toFixed(4)
                    : status?.last_loss != null
                      ? status.last_loss.toFixed(4)
                      : '—'}
                </strong>
              </div>
              <div>
                <small>BACKWARD</small>
                <strong className={status?.last_training_step?.backward ? 'state-ready' : ''}>
                  {status?.last_training_step?.backward ? 'loss.backward() ✓' : training ? '…' : '—'}
                </strong>
              </div>
              <div>
                <small>EPOCH / BATCH</small>
                <strong>
                  {status?.last_training_step
                    ? `${status.last_training_step.epoch}/${status?.total_epochs || epochs} · batch ${status.last_training_step.batch}/${status.last_training_step.batches_total}`
                    : status?.current_epoch
                      ? `${status.current_epoch}/${status.total_epochs || epochs}`
                      : '—'}
                </strong>
              </div>
            </div>
            {latestLinearGradients.length > 0 && (
              <div className="linear-grad-grid">
                <label>Linear layer gradient L2 (after backward)</label>
                {latestLinearGradients.map((layer) => {
                  const magnitude = layer.weight_grad_l2 + layer.bias_grad_l2;
                  const width = Math.min(100, Math.max(6, magnitude * 120));
                  return (
                    <div key={layer.name} className="linear-grad-row">
                      <span className="linear-grad-name">{layer.name}</span>
                      <div className="linear-grad-track">
                        <div
                          className="linear-grad-fill"
                          style={{ width: `${width}%` }}
                          title={`weight L2: ${layer.weight_grad_l2}, bias L2: ${layer.bias_grad_l2}`}
                        />
                      </div>
                      <span className="linear-grad-val">{magnitude.toFixed(3)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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

          <div className="dataset-panel">
            <div className="dataset-panel-head">
              <h3>Training dataset (CRUD)</h3>
              <span>{dataset.length} rows</span>
            </div>
            <div className="dataset-add-row">
              <input
                type="text"
                placeholder="Sample text"
                value={newSampleText}
                onChange={(e) => setNewSampleText(e.target.value)}
                disabled={training}
              />
              <select value={newSampleLabel} onChange={(e) => setNewSampleLabel(e.target.value)} disabled={training}>
                {classOptions.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
              <button type="button" className="py-btn-secondary" disabled={training} onClick={handleAddSample}>
                Add
              </button>
            </div>
            <ul className="dataset-list">
              {dataset.slice(0, 12).map((row) => (
                <li key={`${row.index}-${row.text.slice(0, 24)}`}>
                  <span className="dataset-label">{row.label}</span>
                  <span className="dataset-text">{row.text}</span>
                  <button type="button" disabled={training} onClick={() => handleDeleteSample(row.index)}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Terminal Logs */}
          <div className="terminal-box">
            <div className="terminal-header">
              <span className="dot red"></span>
              <span className="dot yellow"></span>
              <span className="dot green"></span>
              <span className="terminal-title">PyTorch Training Console</span>
            </div>
            <div className="terminal-body" ref={terminalBodyRef}>
              {status?.logs && status.logs.length > 0 ? (
                status.logs.map((log, index) => (
                  <div key={index} className="log-line">
                    {log}
                  </div>
                ))
              ) : (
                <div className="log-line text-muted">Ready to train. Press Start AI Learning above.</div>
              )}
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

          <div className="slot-select-row">
            <label>A/B inference slot:</label>
            <select value={predictSlot} onChange={(e) => setPredictSlot(e.target.value)}>
              <option value="default">Default weights</option>
              <option value="a">Slot A {status?.model_slots?.a ? '✓' : '(empty)'}</option>
              <option value="b">Slot B {status?.model_slots?.b ? '✓' : '(empty)'}</option>
            </select>
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
