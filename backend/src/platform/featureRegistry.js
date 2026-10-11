/**
 * Central registry for AllModelAI advanced systems (phased rollout).
 * Env flags use FEATURE_<ID> where ID is the key uppercased with underscores.
 */

const PLATFORM_FEATURES = Object.freeze([
    {
        id: 'memory_engine',
        name: 'AI Memory Engine',
        phase: 2,
        description: 'Opt-in long-term memory across conversations.',
        envFlag: 'FEATURE_MEMORY_ENGINE',
        defaultEnabled: true,
        existingImplementation: true,
    },
    {
        id: 'knowledge_base_2',
        name: 'AI Knowledge Base 2.0',
        phase: 2,
        description: 'Document intelligence, RAG, and citations.',
        envFlag: 'FEATURE_KNOWLEDGE_BASE_2',
        defaultEnabled: true,
        existingImplementation: true,
    },
    {
        id: 'deep_research_2',
        name: 'Deep Research 2.0',
        phase: 3,
        description: 'Multi-step research, sources, and structured reports.',
        envFlag: 'FEATURE_DEEP_RESEARCH_2',
        defaultEnabled: true,
        existingImplementation: true,
    },
    {
        id: 'video_studio',
        name: 'AI Video Studio',
        phase: 4,
        description: 'Storyboards, projects, and Magic Hour video jobs.',
        envFlag: 'FEATURE_VIDEO_STUDIO',
        defaultEnabled: true,
        existingImplementation: 'partial',
    },
    {
        id: 'voice_realtime',
        name: 'Real-Time Voice AI',
        phase: 5,
        description: 'Streaming speech recognition and synthesis.',
        envFlag: 'FEATURE_VOICE_REALTIME',
        defaultEnabled: false,
        existingImplementation: 'partial',
    },
    {
        id: 'code_executor',
        name: 'AI Code Executor',
        phase: 6,
        description: 'Isolated Python execution sandbox.',
        envFlag: 'FEATURE_CODE_EXECUTOR',
        defaultEnabled: false,
        requiresSandboxUrl: true,
    },
    {
        id: 'agent_tasks',
        name: 'AI Agent Tasks',
        phase: 7,
        description: 'Multi-step approved agent workflows.',
        envFlag: 'FEATURE_AGENT_TASKS',
        defaultEnabled: false,
        ownerPreviewOnly: true,
    },
]);

const JOB_TYPES = Object.freeze({
    kb_document_index: { featureId: 'knowledge_base_2', label: 'Knowledge document indexing' },
    memory_embed: { featureId: 'memory_engine', label: 'Memory embedding' },
    research_report: { featureId: 'deep_research_2', label: 'Research report export' },
    video_scene: { featureId: 'video_studio', label: 'Video scene generation' },
    video_stitch: { featureId: 'video_studio', label: 'Video stitch (FFmpeg)' },
    code_run: { featureId: 'code_executor', label: 'Python sandbox run' },
    agent_task: { featureId: 'agent_tasks', label: 'Agent task run' },
});

function parseEnvBoolean(name, defaultValue) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return defaultValue;
    return !/^(0|false|no|off)$/i.test(String(raw).trim());
}

function getFeatureById(id) {
    return PLATFORM_FEATURES.find((item) => item.id === id) || null;
}

module.exports = {
    PLATFORM_FEATURES,
    JOB_TYPES,
    parseEnvBoolean,
    getFeatureById,
};
