const fs = require('fs');
const path = require('path');

const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

const DEFAULT_TEMPLATE = path.join(__dirname, '../../workflows/comfy-cloud-flux-schnell.api.json');

function resolveWorkflowTemplatePath() {
    const custom = strip(process.env.COMFY_CLOUD_WORKFLOW_PATH);
    if (!custom) return DEFAULT_TEMPLATE;
    return path.isAbsolute(custom) ? custom : path.join(process.cwd(), custom);
}

function loadWorkflowTemplate() {
    const filePath = resolveWorkflowTemplatePath();
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
}

function stepsForQuality(quality) {
    const explicit = Number(process.env.COMFY_CLOUD_STEPS);
    if (Number.isFinite(explicit) && explicit > 0) return Math.min(Math.floor(explicit), 60);
    const key = String(quality || 'standard').toLowerCase();
    if (key === 'ultra') return Number(process.env.COMFY_CLOUD_STEPS_ULTRA) || 8;
    if (key === 'hd') return Number(process.env.COMFY_CLOUD_STEPS_HD) || 6;
    return Number(process.env.COMFY_CLOUD_STEPS_STANDARD) || 4;
}

function parseDimensions(size) {
    const match = String(size || '1024x1024').match(/^(\d+)x(\d+)$/);
    if (!match) return { width: 1024, height: 1024 };
    return { width: Number(match[1]), height: Number(match[2]) };
}

/**
 * Builds a ComfyUI API-format workflow from the bundled template.
 * @param {{ prompt: string, negativePrompt?: string, size?: string, quality?: string, seed?: number }} params
 */
function buildComfyCloudWorkflow(params) {
    const template = loadWorkflowTemplate();
    const workflow = JSON.parse(JSON.stringify(template));
    const { width, height } = parseDimensions(params.size);
    const checkpoint = strip(process.env.COMFY_CLOUD_CHECKPOINT) || workflow['4']?.inputs?.ckpt_name || 'flux1-schnell-fp8.safetensors';
    const seed = Number.isFinite(params.seed)
        ? Math.floor(params.seed)
        : Math.floor(Math.random() * 2 ** 31);

    if (workflow['4']?.inputs) workflow['4'].inputs.ckpt_name = checkpoint;
    if (workflow['5']?.inputs) {
        workflow['5'].inputs.width = width;
        workflow['5'].inputs.height = height;
    }
    if (workflow['6']?.inputs) workflow['6'].inputs.text = String(params.prompt || '').slice(0, 4000);
    if (workflow['7']?.inputs) {
        workflow['7'].inputs.text = String(params.negativePrompt || '').slice(0, 2000);
    }
    if (workflow['3']?.inputs) {
        workflow['3'].inputs.seed = seed;
        workflow['3'].inputs.steps = stepsForQuality(params.quality);
        if (/flux/i.test(checkpoint)) {
            workflow['3'].inputs.cfg = 1;
        }
    }

    return { workflow, checkpoint, seed, width, height, steps: workflow['3']?.inputs?.steps };
}

module.exports = {
    buildComfyCloudWorkflow,
    loadWorkflowTemplate,
    stepsForQuality,
};
