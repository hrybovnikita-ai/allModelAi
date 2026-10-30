const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

const QA_REPORT_PATH = path.join(__dirname, '..', '..', 'data', 'qa-last-run.json');

function loadQaLastRun() {
    if (!existsSync(QA_REPORT_PATH)) {
        return {
            available: false,
            message: 'No recorded QA run on this server. CI uploads qa-last-run.json as a build artifact.',
        };
    }
    try {
        const raw = JSON.parse(readFileSync(QA_REPORT_PATH, 'utf8'));
        const hasRun = Boolean(raw.recordedAt) && raw.source !== 'template';
        if (!hasRun) {
            return {
                available: false,
                message:
                    raw.note ||
                    'No completed QA run recorded yet. Run npm run qa:critical locally or check CI artifacts.',
            };
        }
        return {
            available: true,
            ...raw,
        };
    } catch (err) {
        return {
            available: false,
            message: `Could not parse QA report: ${err.message}`,
        };
    }
}

module.exports = {
    loadQaLastRun,
    QA_REPORT_PATH,
};
