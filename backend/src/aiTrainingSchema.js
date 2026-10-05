const AI_TRAINING_DDL = `
CREATE TABLE IF NOT EXISTS ai_training_lesson_progress (
    email TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (email, lesson_id)
);

CREATE INDEX IF NOT EXISTS ai_training_lesson_progress_email
ON ai_training_lesson_progress(email, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_training_experiments (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    lab_type TEXT NOT NULL,
    config TEXT NOT NULL,
    result_summary TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_training_experiments_email
ON ai_training_experiments(email, created_at DESC);
`;

const ensureAiTrainingSchema = (database) => {
    database.exec(AI_TRAINING_DDL);
};

module.exports = {
    ensureAiTrainingSchema,
    AI_TRAINING_DDL,
};
