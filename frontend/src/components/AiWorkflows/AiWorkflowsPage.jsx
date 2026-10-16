import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { useLanguage } from '../../lib/useLanguage';
import '../KnowledgeBase/KnowledgeBase.css';

export default function AiWorkflowsPage() {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [name, setName] = useState('My workflow');
  const [inputText, setInputText] = useState('');
  const [graph, setGraph] = useState(null);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const [tpl, list] = await Promise.all([
      apiFetch('/api/workflows/templates'),
      apiFetch('/api/workflows'),
    ]);
    const tplData = await tpl.json().catch(() => ({}));
    const listData = await list.json().catch(() => ({}));
    if (!tpl.ok) throw new Error(tplData.message || 'Templates unavailable');
    if (!list.ok) throw new Error(listData.message || 'Workflows unavailable');
    setTemplates(tplData.templates || []);
    setWorkflows(listData.workflows || []);
    if (!graph && tplData.templates?.[0]?.graph) {
      setGraph(tplData.templates[0].graph);
    }
  }, [graph]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const useTemplate = (template) => {
    setGraph(template.graph);
    setName(template.name);
    setSuccess(t('Template loaded. Review steps before running.'));
  };

  const save = async () => {
    if (!graph) return;
    setBusy('save');
    setError('');
    try {
      const res = await apiFetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, graph }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Save failed');
      setSuccess(t('Workflow saved.'));
      await load();
      return data;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy('');
    }
  };

  const runWorkflow = async () => {
    setBusy('run');
    setError('');
    setRun(null);
    try {
      let workflowId = workflows.find((item) => item.name === name)?.id;
      if (!workflowId) {
        const saved = await save();
        workflowId = saved?.id;
      }
      if (!workflowId) throw new Error('Save the workflow before running');
      const res = await apiFetch(`/api/workflows/${encodeURIComponent(workflowId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Run failed');
      setRun(data.run);
      setSuccess(t('Workflow run finished.'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="kb-page">
      <header className="kb-header">
        <Link className="kb-brand" to="/dashboard">AllModelAI</Link>
        <nav className="kb-nav">
          <Link to="/ai-files">{t('AI Files')}</Link>
          <Link to="/chat">{t('Chat')}</Link>
        </nav>
      </header>
      <section className="kb-hero">
        <h1>{t('AI Workflows')}</h1>
        <p>{t('Connect AI steps in sequence. Cycles and unapproved external actions are blocked.')}</p>
      </section>

      {error ? <p className="kb-error" role="alert">{error}</p> : null}
      {success ? <p className="kb-success" role="status">{success}</p> : null}

      <section className="kb-panel">
        <h2>{t('Templates')}</h2>
        <ul className="kb-doc-list">
          {templates.map((template) => (
            <li key={template.id}>
              <span>{template.name}</span>
              <button type="button" onClick={() => useTemplate(template)}>{t('Use')}</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="kb-panel">
        <label>
          {t('Workflow name')}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t('Input text')}
          <textarea rows={4} value={inputText} onChange={(e) => setInputText(e.target.value)} />
        </label>
        {graph ? (
          <ol>
            {graph.nodes.map((node) => (
              <li key={node.id}>
                <strong>{node.label || node.id}</strong> → {node.model}
                <div>{node.prompt}</div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="kb-empty">{t('Choose a template to start.')}</p>
        )}
        <div className="kb-actions">
          <button type="button" onClick={save} disabled={!graph || busy}>{busy === 'save' ? t('Saving…') : t('Save')}</button>
          <button type="button" onClick={runWorkflow} disabled={!graph || busy}>{busy === 'run' ? t('Running…') : t('Run')}</button>
        </div>
      </section>

      {run ? (
        <section className="kb-panel">
          <h2>{t('Run status')}: {run.status}</h2>
          <ul>
            {(run.progress?.steps || []).map((step) => (
              <li key={step.id}>{step.id}: {step.status}</li>
            ))}
          </ul>
          {run.outputs ? (
            <pre>{JSON.stringify(run.outputs, null, 2)}</pre>
          ) : null}
        </section>
      ) : null}

      <section className="kb-panel">
        <h2>{t('Saved workflows')}</h2>
        {!workflows.length ? <p className="kb-empty">{t('No saved workflows yet.')}</p> : (
          <ul className="kb-doc-list">
            {workflows.map((item) => (
              <li key={item.id}>
                <span>{item.name}</span>
                <button type="button" onClick={() => { setGraph(item.graph); setName(item.name); }}>{t('Open')}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
