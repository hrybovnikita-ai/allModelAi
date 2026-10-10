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

const MODEL_LAB_TYPES = new Set([
    'linear-regression',
    'logistic-regression',
    'neural-network',
    'sklearn-linear-regression',
    'sklearn-logistic-regression',
]);
const MAX_BATCH_SIZE = Math.min(128, Math.max(8, parseInt(process.env.AI_TRAINING_MAX_BATCH_SIZE || '128', 10)));

const validateModelLabStartBody = (body = {}) => {
    const modelType = String(body.modelType || body.model_type || '').trim();
    if (!MODEL_LAB_TYPES.has(modelType)) {
        return {
            ok: false,
            message: 'modelType must be linear-regression, logistic-regression, neural-network, sklearn-linear-regression, or sklearn-logistic-regression',
        };
    }
    const learningRate = Number(body.learningRate ?? body.learning_rate ?? 0.01);
    const epochs = parseInt(body.epochs ?? 100, 10);
    const batchSize = parseInt(body.batchSize ?? body.batch_size ?? 32, 10);
    const seed = parseInt(body.seed ?? 42, 10);
    const dataPoints = parseInt(body.dataPoints ?? body.data_points ?? 120, 10);

    if (!Number.isFinite(learningRate) || learningRate < MIN_LEARNING_RATE || learningRate > MAX_LEARNING_RATE) {
        return { ok: false, message: `learningRate must be between ${MIN_LEARNING_RATE} and ${MAX_LEARNING_RATE}` };
    }
    if (!Number.isInteger(epochs) || epochs < MIN_EPOCHS || epochs > MAX_EPOCHS) {
        return { ok: false, message: `epochs must be between ${MIN_EPOCHS} and ${MAX_EPOCHS}` };
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
        return { ok: false, message: `batchSize must be between 1 and ${MAX_BATCH_SIZE}` };
    }
    if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 30) {
        return { ok: false, message: 'seed must be a non-negative integer' };
    }
    if (!Number.isInteger(dataPoints) || dataPoints < 32 || dataPoints > MAX_DATA_POINTS) {
        return { ok: false, message: `dataPoints must be between 32 and ${MAX_DATA_POINTS}` };
    }

    return {
        ok: true,
        payload: {
            modelType,
            learningRate,
            epochs,
            batchSize,
            seed,
            dataPoints,
        },
    };
};

const validateModelLabPredictBody = (body = {}) => {
    const inputs = Array.isArray(body.inputs) ? body.inputs : (Array.isArray(body.x) ? body.x : []);
    if (!inputs.length || inputs.length > 20) {
        return { ok: false, message: 'inputs must contain 1-20 numbers' };
    }
    const nums = inputs.map((v) => Number(v));
    if (nums.some((n) => !Number.isFinite(n))) {
        return { ok: false, message: 'inputs must be finite numbers' };
    }
    return { ok: true, payload: { inputs: nums } };
};

module.exports = {
    validateLabTrainBody,
    validateModelLabStartBody,
    validateModelLabPredictBody,
    MAX_EPOCHS,
    MIN_EPOCHS,
    MAX_LEARNING_RATE,
    MIN_LEARNING_RATE,
    MAX_DATA_POINTS,
    MAX_BATCH_SIZE,
};
