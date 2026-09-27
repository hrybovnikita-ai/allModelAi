const TRAIN_PER_DAY = Math.max(1, parseInt(process.env.AI_PYTHON_TRAIN_PER_DAY || '5', 10));
const PREDICT_PER_MINUTE = Math.max(10, parseInt(process.env.AI_PYTHON_PREDICT_PER_MIN || '60', 10));

const trainCounts = new Map();
const predictCounts = new Map();

const dayKey = () => new Date().toISOString().slice(0, 10);
const minuteKey = () => new Date().toISOString().slice(0, 16);

const checkTrainQuota = (email) => {
    const key = `${String(email).toLowerCase()}::${dayKey()}`;
    const used = trainCounts.get(key) || 0;
    if (used >= TRAIN_PER_DAY) {
        return {
            allowed: false,
            message: `Training limit reached (${TRAIN_PER_DAY}/day). Try again tomorrow or use a background job.`,
            limit: TRAIN_PER_DAY,
            used,
        };
    }
    return { allowed: true, limit: TRAIN_PER_DAY, used, remaining: TRAIN_PER_DAY - used };
};

const consumeTrainQuota = (email) => {
    const key = `${String(email).toLowerCase()}::${dayKey()}`;
    const used = (trainCounts.get(key) || 0) + 1;
    trainCounts.set(key, used);
    return used;
};

const checkPredictQuota = (email) => {
    const key = `${String(email).toLowerCase()}::${minuteKey()}`;
    const used = predictCounts.get(key) || 0;
    if (used >= PREDICT_PER_MINUTE) {
        return {
            allowed: false,
            message: `Predict rate limit (${PREDICT_PER_MINUTE}/minute). Wait a moment and retry.`,
            limit: PREDICT_PER_MINUTE,
            used,
        };
    }
    return { allowed: true, limit: PREDICT_PER_MINUTE, used, remaining: PREDICT_PER_MINUTE - used };
};

const consumePredictQuota = (email) => {
    const key = `${String(email).toLowerCase()}::${minuteKey()}`;
    const used = (predictCounts.get(key) || 0) + 1;
    predictCounts.set(key, used);
    return used;
};

const getQuotaSnapshot = (email) => ({
    train: checkTrainQuota(email),
    predict: checkPredictQuota(email),
});

module.exports = {
    checkTrainQuota,
    consumeTrainQuota,
    checkPredictQuota,
    consumePredictQuota,
    getQuotaSnapshot,
    TRAIN_PER_DAY,
    PREDICT_PER_MINUTE,
};
