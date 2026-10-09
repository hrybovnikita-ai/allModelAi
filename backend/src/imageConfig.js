const { getPollinationsApiKey, isPollinationsKey } = require('./pollinations');
const { isComfyCloudConfigured } = require('./comfyCloud');
const {
    listConfiguredImageProviders,
    isProviderConfigured,
} = require('./services/imageGenerationService');

const strip = (value) => String(value || '').trim().replace(/^["']|["']$/g, '');

const getOpenAiImageKeyHint = () => {
    const candidates = [
        ['IMAGE_API_KEY', process.env.IMAGE_API_KEY],
        ['OPENAI_API_KEY', process.env.OPENAI_API_KEY],
        ['OPEN_AI_API_KEY', process.env.OPEN_AI_API_KEY],
        ['API_IMAGE_KEY', process.env.API_IMAGE_KEY],
    ];
    for (const [name, value] of candidates) {
        const key = strip(value);
        if (!key) continue;
        if (/^sk-or-/i.test(key)) {
            return { name, issue: 'openrouter_not_openai' };
        }
        if (!/^sk-/i.test(key)) {
            return { name, issue: 'invalid_format' };
        }
    }
    return null;
};

const getCloudflareHint = () => {
    const account = strip(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID);
    const key = strip(
        process.env.CLOUDFLARE_API_TOKEN
        || process.env.CLOUDFLARE_API_KEY
        || process.env.CLAUDEFLARE_API_KEY
        || process.env.AllModelAi_API_KEY_IMAGE,
    );
    if (key && /^sk-/i.test(key)) {
        return { issue: 'invalid_cloudflare_token_format' };
    }
    if (!account && !key) return null;
    if (!account) return { issue: 'missing_account' };
    if (!key) return { issue: 'missing_api_key' };
    return null;
};

/**
 * Lists configuration gaps when no image provider is ready (never logs secret values).
 */
function imageConfigurationReport() {
    const providers = listConfiguredImageProviders();
    const missing = [];
    const warnings = [];

    if (providers.length > 0) {
        return {
            ok: true,
            configured: true,
            providers,
            primaryProvider: providers[0],
            missing,
            warnings,
        };
    }

    if (!isComfyCloudConfigured()) {
        missing.push('COMFY_CLOUD_API_KEY or COMFYUI_API_KEY (Comfy Cloud — https://platform.comfy.org/profile/api-keys)');
    }

    const pollinationsRaw = getPollinationsApiKey();
    if (!pollinationsRaw) {
        missing.push('POLLINATIONS_API_KEY (recommended; POLINATIONS_API_KEY alias accepted)');
    } else if (!isPollinationsKey(pollinationsRaw)) {
        warnings.push('POLLINATIONS_API_KEY must start with sk_ (Pollinations secret key from enter.pollinations.ai).');
    }

    const openAiHint = getOpenAiImageKeyHint();
    const hasOpenAiCandidate = ['IMAGE_API_KEY', 'OPENAI_API_KEY', 'OPEN_AI_API_KEY', 'API_IMAGE_KEY'].some(
        (name) => strip(process.env[name]),
    );
    if (!hasOpenAiCandidate) {
        missing.push('IMAGE_API_KEY or OPENAI_API_KEY (OpenAI sk-… key for gpt-image / DALL·E)');
    } else if (openAiHint?.issue === 'openrouter_not_openai') {
        warnings.push(`${openAiHint.name} looks like an OpenRouter key (sk-or-…); image generation needs a dedicated OpenAI or Pollinations key.`);
    } else if (openAiHint?.issue === 'invalid_format') {
        warnings.push(`${openAiHint.name} is set but is not a valid OpenAI secret key format.`);
    }

    const cloudflareHint = getCloudflareHint();
    if (cloudflareHint?.issue === 'missing_account') {
        missing.push('CLOUDFLARE_ACCOUNT_ID (with CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY for Workers AI images)');
    } else if (cloudflareHint?.issue === 'missing_api_key') {
        missing.push('CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY (with CLOUDFLARE_ACCOUNT_ID)');
    } else if (cloudflareHint?.issue === 'invalid_cloudflare_token_format') {
        warnings.push('CLOUDFLARE_API_TOKEN must be a Cloudflare Workers AI API token, not an OpenAI sk- key.');
    } else if (!cloudflareHint && !strip(process.env.CLOUDFLARE_ACCOUNT_ID)) {
        missing.push('Optional: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN');
    }

    const explicit = strip(process.env.IMAGE_GENERATION_PROVIDER || process.env.IMAGE_PROVIDER).toLowerCase();
    const normalizedExplicit = explicit === 'comfy' ? 'comfy-cloud' : explicit;
    if (explicit && !['comfy-cloud', 'pollinations', 'openai', 'cloudflare', 'comfy'].includes(explicit)) {
        warnings.push(`IMAGE_PROVIDER=${explicit} is not recognized. Use comfy-cloud, pollinations, openai, or cloudflare.`);
    }
    if (normalizedExplicit === 'comfy-cloud' && !isComfyCloudConfigured()) {
        warnings.push('IMAGE_PROVIDER=comfy-cloud but COMFY_CLOUD_API_KEY is missing.');
    }

    return {
        ok: false,
        configured: false,
        providers: [],
        primaryProvider: null,
        missing: missing.slice(0, 4),
        warnings,
        message: 'No image generation provider is configured on the server.',
        code: 'IMAGE_NOT_CONFIGURED',
    };
}

function imageGenerationHealth() {
    const report = imageConfigurationReport();
    const explicit = strip(process.env.IMAGE_GENERATION_PROVIDER || process.env.IMAGE_PROVIDER).toLowerCase();
    const normalizedExplicit = explicit === 'comfy' ? 'comfy-cloud' : explicit;
    const {
        getCloudflareAccountId,
        getCloudflareApiToken,
        isCloudflareImageConfigured,
        DEFAULT_MODEL,
    } = require('./services/cloudflareImageService');
    const tokenPresent = Boolean(getCloudflareApiToken());
    const accountPresent = Boolean(getCloudflareAccountId());
    return {
        configured: report.configured,
        provider: report.primaryProvider || normalizedExplicit || null,
        explicitProvider: normalizedExplicit || null,
        providers: report.providers || [],
        cloudflare: {
            ready: isCloudflareImageConfigured(),
            accountIdPresent: accountPresent,
            tokenPresent,
            model: strip(process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_MODEL),
        },
        missingEnvVars: report.missing || [],
        warnings: report.warnings || [],
        code: report.configured ? null : (report.code || 'IMAGE_NOT_CONFIGURED'),
    };
}

module.exports = {
    imageConfigurationReport,
    imageGenerationHealth,
    isProviderConfigured,
};
