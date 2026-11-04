import { Cpu, Clock3 } from 'lucide-react';
import { isJobActive } from '../../lib/backgroundJobs';
import './AITaskProgress.css';

function formatPercent(job) {
  if (job?.progress == null || job?.indeterminate) return null;
  const n = Number(job.progress);
  if (!Number.isFinite(n)) return null;
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

function stepLabel(job) {
  if (job?.stepIndex && job?.stepTotal) {
    return `Step ${job.stepIndex} of ${job.stepTotal}${job.stage ? ` — ${job.stage}` : ''}`;
  }
  return job?.stage || 'Queued';
}

function etaLabel(job) {
  if (!isJobActive(job?.status)) return null;
  if (job?.etaLabel) return job.etaLabel;
  if (job?.etaSeconds != null && job.etaSeconds > 0) return `~${job.etaSeconds} sec`;
  if (job?.indeterminate || job?.progress == null) return 'Estimating…';
  return null;
}

export default function AITaskProgress({
  job,
  title = 'Processing your document',
  badge,
  onCancel,
  cancelLabel = 'Cancel',
  hint,
  className = '',
}) {
  const percentText = formatPercent(job);
  const indeterminate = Boolean(
    job?.indeterminate || (isJobActive(job?.status) && job?.progress == null),
  );
  const barWidth = indeterminate ? 38 : Math.max(0, Math.min(100, Number(job?.progress) || 0));
  const remaining = etaLabel(job);

  return (
    <div className={`ai-task-progress ${className}`.trim()} role="status" aria-live="polite">
      <div className="ai-task-progress__header">
        <div className="ai-task-progress__title-row">
          <Cpu className="ai-task-progress__icon" aria-hidden />
          <span>AI Task Progress</span>
        </div>
        {badge ? <span className="ai-task-progress__badge">{badge}</span> : null}
      </div>

      <h3 className="ai-task-progress__headline">{title}</h3>

      <div className="ai-task-progress__meta-row">
        <span>{stepLabel(job)}</span>
        {percentText ? <span className="ai-task-progress__percent">{percentText}</span> : null}
      </div>

      <div className={`ai-task-progress__bar${indeterminate ? ' ai-task-progress__bar--indeterminate' : ''}`}>
        <div className="ai-task-progress__bar-fill" style={{ width: `${barWidth}%` }} />
      </div>

      <div className="ai-task-progress__footer">
        <span>
          {remaining ? (
            <>
              <Clock3 size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden />
              Estimated remaining: {remaining}
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </span>
        <span className="ai-task-progress__status">{job?.status || 'queued'}</span>
      </div>

      {hint ? <p className="ai-task-progress__hint">{hint}</p> : null}

      {onCancel && isJobActive(job?.status) ? (
        <div className="ai-task-progress__actions">
          <button type="button" className="ai-task-progress__btn" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
