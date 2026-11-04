import { useCallback } from 'react';
import AITaskProgress from '../AITaskProgress/AITaskProgress';
import { useBackgroundJob } from '../../hooks/useBackgroundJob';
import { jobHeadline } from '../../lib/backgroundJobs';

export default function JobProgressCard({ jobId, initialJob, onCancelled }) {
  const { job, cancel, error } = useBackgroundJob(jobId, {
    kind: 'background',
    autoRemember: true,
  });

  const snapshot = job || initialJob;
  const handleCancel = useCallback(async () => {
    try {
      await cancel();
      onCancelled?.();
    } catch {
      /* parent may surface errors */
    }
  }, [cancel, onCancelled]);

  if (!snapshot && !error) return null;

  return (
    <AITaskProgress
      job={snapshot}
      title={jobHeadline(snapshot)}
      onCancel={handleCancel}
      hint={error || undefined}
    />
  );
}
