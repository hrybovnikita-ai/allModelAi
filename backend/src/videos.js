const { postVideoGenerate, getVideoGenerationStatus } = require('./controllers/videoController');

/** @deprecated use POST /api/video/generate — kept for existing Chat client */
const generateVideo = postVideoGenerate;

module.exports = {
    generateVideo,
    getVideoGenerationStatus,
};
