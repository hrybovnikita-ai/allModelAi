-- Link video jobs to chat conversations (optional metadata)

ALTER TABLE video_generation_jobs
    ADD COLUMN IF NOT EXISTS conversation_id TEXT,
    ADD COLUMN IF NOT EXISTS message_id TEXT;

CREATE INDEX IF NOT EXISTS video_generation_jobs_conversation
ON video_generation_jobs(conversation_id, created_at DESC);
