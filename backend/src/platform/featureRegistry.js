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
    {
        id: 'ai_fallback',
        name: 'Automatic AI Fallback',
        phase: 2,
        description: 'Opt-in provider/model fallback on timeout, rate limit, or outage.',
        envFlag: 'FEATURE_AI_FALLBACK',
        defaultEnabled: true,
        existingImplementation: 'partial',
    },
    {
        id: 'ai_file_manager',
        name: 'AI File Manager',
        phase: 3,
        description: 'Secure document upload, extraction, and grounded Q&A.',
        envFlag: 'FEATURE_AI_FILE_MANAGER',
        defaultEnabled: false,
    },
    {
        id: 'ai_workflows',
        name: 'AI Workflow Builder',
        phase: 4,
        description: 'Multi-step visual AI workflows with budgets and cancellation.',
        envFlag: 'FEATURE_AI_WORKFLOWS',
        defaultEnabled: false,
    },
    {
        id: 'ai_evaluation_lab',
        name: 'AI Evaluation Lab',
        phase: 5,
        description: 'Comparable model evaluation datasets and result export.',
        envFlag: 'FEATURE_AI_EVALUATION_LAB',
        defaultEnabled: false,
        ownerPreviewOnly: true,
    },
    {
        id: 'ollama_local',
        name: 'Local Ollama Models',
        phase: 6,
        description: 'Allowlisted local/desktop Ollama models via secure adapter.',
        envFlag: 'FEATURE_OLLAMA_LOCAL',
        defaultEnabled: false,
    },
    {
        id: 'billing_live_checkout',
        name: 'Live Subscription Checkout',
        phase: 7,
        description: 'Enable live payment checkout when provider credentials are verified.',
        envFlag: 'FEATURE_BILLING_LIVE_CHECKOUT',
        defaultEnabled: false,
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
    file_index: { featureId: 'ai_file_manager', label: 'AI file indexing' },
    workflow_run: { featureId: 'ai_workflows', label: 'AI workflow run' },
    evaluation_run: { featureId: 'ai_evaluation_lab', label: 'AI evaluation run' },
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
