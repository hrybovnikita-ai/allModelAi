import { useMemo, useState } from 'react';
import { DEEP_RESEARCH_PROGRESS_STEPS, stepIndexForStage } from '../../lib/deepResearchClient.js';
import './DeepResearch.css';

function ChipGroup({ question, value, onChange, disabled }) {
  const selected = value;
  const isMulti = question.type === 'multi';
  const toggle = (id) => {
    if (disabled) return;
    if (isMulti) {
      const set = new Set(Array.isArray(selected) ? selected : []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      onChange([...set]);
      return;
    }
    onChange(id);
  };

  return (
    <div className="dr-chip-row" role={isMulti ? 'group' : 'radiogroup'} aria-label={question.prompt}>
      {question.options.map((opt) => {
        const active = isMulti
          ? (Array.isArray(selected) && selected.includes(opt.id))
          : selected === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className={`dr-chip ${active ? 'active' : ''}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => toggle(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function DeepResearchClarificationCard({
  topicTitle,
  questions = [],
  busy = false,
  onStart,
  onSkip,
}) {
  const [answers, setAnswers] = useState({});
  const [otherText, setOtherText] = useState({});

  const setAnswer = (id, value) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleStart = () => {
    const merged = { ...answers };
    Object.entries(otherText).forEach(([key, text]) => {
      if (text?.trim()) merged[`${key}_other`] = text.trim();
    });
    onStart?.(merged);
  };

  return (
    <section className="dr-card dr-clarify" aria-label="Deep Research clarification">
      <header className="dr-card-head">
        <span className="dr-badge" aria-hidden="true">🔎</span>
        <div>
          <strong>Deep Research</strong>
          <p>Before I start, a few details will help me research this properly.</p>
        </div>
      </header>
      {topicTitle && <p className="dr-topic">{topicTitle}</p>}
      <ol className="dr-questions">
        {questions.map((question, index) => (
          <li key={question.id}>
            <span className="dr-q-label">{index + 1}. {question.prompt}</span>
            {question.type === 'text' ? (
              <input
                type="text"
                className="dr-text-input"
                disabled={busy}
                value={answers[question.id] || ''}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                placeholder="Your answer"
              />
            ) : (
              <>
                <ChipGroup
                  question={question}
                  value={answers[question.id]}
                  onChange={(val) => setAnswer(question.id, val)}
                  disabled={busy}
                />
                {question.allowOther && (
                  <input
                    type="text"
                    className="dr-text-input dr-other"
                    disabled={busy}
                    placeholder="Other (optional)"
                    value={otherText[question.id] || ''}
                    onChange={(e) => setOtherText((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  />
                )}
              </>
            )}
          </li>
        ))}
      </ol>
      <div className="dr-actions">
        <button type="button" className="dr-primary" disabled={busy} onClick={handleStart}>
          Start research
        </button>
        <button type="button" className="dr-ghost" disabled={busy} onClick={onSkip}>
          Skip questions and start
        </button>
      </div>
    </section>
  );
}

export function DeepResearchProgressPanel({
  topic,
  stage,
  sourceCount,
  onStop,
  sources = [],
  showSources = false,
}) {
  const activeIndex = stepIndexForStage(stage || 'understanding');
  const reducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const visibleSources = useMemo(() => sources.slice(0, 8), [sources]);
  const [sourcesOpen, setSourcesOpen] = useState(showSources);

  return (
    <section className="dr-card dr-progress" aria-label="Deep Research progress" aria-live="polite">
      <header className="dr-card-head">
        <span className="dr-badge pulse" aria-hidden="true">🔎</span>
        <div>
          <strong>Deep Research</strong>
          {topic && <p className="dr-topic">Researching: {topic}</p>}
        </div>
      </header>
      <ol className="dr-steps">
        {DEEP_RESEARCH_PROGRESS_STEPS.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={step.id} className={`dr-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
              <span className="dr-step-icon" aria-hidden="true">{done ? '✓' : active ? '●' : '○'}</span>
              <span>{step.label}</span>
              {step.id === 'searching' && (active || done) && sourceCount != null && sourceCount > 0 && (
                <small className="dr-sub">{sourceCount} source{sourceCount === 1 ? '' : 's'}</small>
              )}
            </li>
          );
        })}
      </ol>
      {visibleSources.length > 0 && (
        <div className="dr-sources-live">
          <button
            type="button"
            className="dr-sources-toggle"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((open) => !open)}
          >
            Sources discovered · {sources.length || sourceCount || visibleSources.length}
          </button>
          {sourcesOpen && (
            <ul className="dr-sources-compact">
              {visibleSources.map((source) => (
                <li key={source.url || source.title}>
                  <strong>{source.title || source.domain}</strong>
                  <span>{source.domain}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {onStop && (
        <button type="button" className="dr-stop" onClick={onStop}>
          Stop research
        </button>
      )}
      {!reducedMotion && <div className="dr-glow" aria-hidden="true" />}
    </section>
  );
}

export function DeepResearchDetails({ meta }) {
  if (!meta) return null;
  const [open, setOpen] = useState(false);
  return (
    <details className="dr-details" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary>Research details</summary>
      <ul>
        {meta.mode && <li>Research mode: {meta.mode}</li>}
        {meta.sourcesReviewed != null && <li>Sources reviewed: {meta.sourcesReviewed}</li>}
        {meta.searchQueries != null && <li>Search queries: {meta.searchQueries}</li>}
        {Array.isArray(meta.modelsUsed) && meta.modelsUsed.length > 0 && (
          <li>Models used: {meta.modelsUsed.join(', ')}</li>
        )}
        {meta.durationMs != null && <li>Duration: {Math.round(meta.durationMs / 1000)}s</li>}
        {meta.knowledgeBaseDocumentsUsed > 0 && (
          <li>Knowledge Base documents used: {meta.knowledgeBaseDocumentsUsed}</li>
        )}
        {meta.verificationIncomplete && <li>Verification: incomplete</li>}
      </ul>
    </details>
  );
}

export function DeepResearchConfigError({ message, onRetry }) {
  return (
    <section className="dr-card dr-error" role="alert">
      <strong>Deep Research unavailable</strong>
      <p>{message || 'Web research is temporarily unavailable.'}</p>
      {onRetry && (
        <button type="button" className="dr-primary" onClick={onRetry}>
          Retry
        </button>
      )}
    </section>
  );
}
