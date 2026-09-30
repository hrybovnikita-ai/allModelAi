const { authLog } = require('./authHelpers');

function logAuthStage(stage) {
    return (_req, _res, next) => {
        authLog(stage);
        next();
    };
}

module.exports = {
    logAuthStage,
};
