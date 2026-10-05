const MAX_EPOCHS = Math.min(
    5000,
    Math.max(100, parseInt(process.env.AI_TRAINING_MAX_EPOCHS || '2000', 10)),
);
const MIN_EPOCHS = 1;
const MAX_LEARNING_RATE = 1.0;
const MIN_LEARNING_RATE = 1e-6;
const MAX_DATA_POINTS = Math.max(
    32,
    parseInt(process.env.AI_TRAINING_MAX_DATA_POINTS || '256', 10),
);

const validateLabTrainBody = (body = {}) => {
    const learningRate = Number(body.learningRate ?? body.learning_rate ?? 0.01);
    const epochs = parseInt(body.epochs ?? 500, 10);
    const initialWeight = Number(body.initialWeight ?? body.initial_weight ?? 0);
    const initialBias = Number(body.initialBias ?? body.initial_bias ?? 0);
    const seed = parseInt(body.seed ?? 42, 10);
    const dataPoints = parseInt(body.dataPoints ?? body.data_points ?? 40, 10);
    const snapshotEvery = parseInt(body.snapshotEvery ?? body.snapshot_every ?? 10, 10);

    if (!Number.isFinite(learningRate) || learningRate < MIN_LEARNING_RATE || learningRate > MAX_LEARNING_RATE) {
        return { ok: false, message: `learningRate must be between ${MIN_LEARNING_RATE} and ${MAX_LEARNING_RATE}` };
    }
    if (!Number.isInteger(epochs) || epochs < MIN_EPOCHS || epochs > MAX_EPOCHS) {
        return { ok: false, message: `epochs must be between ${MIN_EPOCHS} and ${MAX_EPOCHS}` };
    }
    if (!Number.isFinite(initialWeight) || Math.abs(initialWeight) > 1000) {
        return { ok: false, message: 'initialWeight out of range' };
    }
    if (!Number.isFinite(initialBias) || Math.abs(initialBias) > 1000) {
        return { ok: false, message: 'initialBias out of range' };
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 30) {
        return { ok: false, message: 'seed must be a non-negative integer' };
    }
    if (!Number.isInteger(dataPoints) || dataPoints < 8 || dataPoints > MAX_DATA_POINTS) {
        return { ok: false, message: `dataPoints must be between 8 and ${MAX_DATA_POINTS}` };
    }
    if (!Number.isInteger(snapshotEvery) || snapshotEvery < 1 || snapshotEvery > 100) {
        return { ok: false, message: 'snapshotEvery must be between 1 and 100' };
    }

    return {
        ok: true,
        payload: {
            learning_rate: learningRate,
            epochs,
            initial_weight: initialWeight,
            initial_bias: initialBias,
            seed,
            data_points: dataPoints,
            snapshot_every: snapshotEvery,
        },
    };
};

module.exports = {
    validateLabTrainBody,
    MAX_EPOCHS,
    MIN_EPOCHS,
    MAX_LEARNING_RATE,
    MIN_LEARNING_RATE,
    MAX_DATA_POINTS,
};
