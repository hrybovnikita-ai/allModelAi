const VIDEO_JOBS_DDL = `
CREATE TABLE IF NOT EXISTS video_generation_jobs (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_project_id TEXT,
    mode TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    aspect_ratio TEXT,
    resolution TEXT,
    model TEXT,
    duration_seconds REAL,
    credits_estimated INTEGER,
    credits_charged INTEGER,
    video_url TEXT,
    stored_relative_path TEXT,
    mime_type TEXT DEFAULT 'video/mp4',
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS video_generation_jobs_email
ON video_generation_jobs(email, created_at DESC);

CREATE INDEX IF NOT EXISTS video_generation_jobs_provider_project
ON video_generation_jobs(provider_project_id);
`;

function ensureVideoGenerationSchema(database) {
    database.exec(VIDEO_JOBS_DDL);
    const columns = new Set(
        database.prepare('PRAGMA table_info(video_generation_jobs)').all().map((row) => row.name),
    );
    if (!columns.has('conversation_id')) {
        database.exec('ALTER TABLE video_generation_jobs ADD COLUMN conversation_id TEXT');
    }
    if (!columns.has('message_id')) {
        database.exec('ALTER TABLE video_generation_jobs ADD COLUMN message_id TEXT');
    }
    database.exec(`
        CREATE INDEX IF NOT EXISTS video_generation_jobs_conversation
        ON video_generation_jobs(conversation_id, created_at DESC);
    `);
}

module.exports = {
    ensureVideoGenerationSchema,
};
