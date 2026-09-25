const { parseQuality, parseAspect, parseStyle } = require('./imageProviderAdapter');

const STYLE_FAMILIES = [
    { id: 'pixel', pattern: /\b(pixel[\s-]?art|8[\s-]?bit|16[\s-]?bit|пиксель)/i },
    { id: 'logo', pattern: /\b(logo|icon|wordmark|логотип|иконк)/i },
    { id: 'anime', pattern: /\b(anime|manga|аниме|манга)/i },
    { id: 'illustration', pattern: /\b(illustration|digital[\s-]?art|watercolor|oil painting|sketch|cartoon|vector|comic|иллюстрац|акварель)/i },
    { id: '3d', pattern: /\b(3d|three[\s-]?d|cgi|octane|unreal|blender)/i },
    { id: 'photo', pattern: /\b(photorealistic|photograph|photo\b|realistic|dslr|реалист|фотореалист)/i },
];

const QUALITY_LINES = {
    neutral: {
        standard: 'clear details, coherent composition, clean edges',
        hd: 'highly detailed, sharp focus, professional lighting, detailed textures, cinematic composition, high dynamic range, clean edges',
        ultra: 'ultra detailed, tack-sharp focus, professional lighting, intricate textures, cinematic composition, high dynamic range, crisp edges, refined materials',
    },
    cinematic: {
        standard: 'cinematic composition, clear details, clean edges',
        hd: 'highly detailed, sharp focus, dramatic lighting, cinematic composition, detailed textures, high dynamic range, clean edges',
        ultra: 'ultra detailed, tack-sharp focus, dramatic lighting, cinematic composition, intricate textures, high dynamic range, crisp edges',
    },
    anime: {
        standard: 'clean anime linework, coherent composition, clean edges',
        hd: 'highly detailed anime illustration, crisp linework, expressive shading, sharp focus, clean edges',
        ultra: 'ultra detailed anime illustration, crisp linework, refined shading, sharp focus, polished color, clean edges',
    },
    illustration: {
        standard: 'clear illustration, coherent composition, clean edges',
        hd: 'highly detailed illustration, sharp focus, professional lighting, detailed textures, clean edges',
        ultra: 'ultra detailed illustration, tack-sharp focus, rich textures, refined lighting, clean edges',
    },
    '3d': {
        standard: 'clean 3D render, coherent composition, clean edges',
        hd: 'high-quality 3D render, sharp focus, detailed materials, professional lighting, clean edges',
        ultra: 'ultra detailed 3D render, tack-sharp focus, intricate materials, professional lighting, clean edges',
    },
    pixel: {
        standard: 'crisp pixel art, consistent pixel grid, clean edges',
        hd: 'crisp pixel art, consistent pixel grid, clear silhouette, limited coherent palette',
        ultra: 'crisp pixel art, consistent pixel grid, clean silhouette, refined palette',
    },
    logo: {
        standard: 'clean logo design, sharp edges, simple composition',
        hd: 'clean professional logo, sharp edges, clear shapes, uncluttered composition',
        ultra: 'crisp professional logo, razor-sharp edges, precise geometry, uncluttered composition',
    },
    photo: {
        standard: 'photorealistic, clear photograph, natural lighting, clean edges',
        hd: 'photorealistic, highly detailed, sharp focus, professional lighting, detailed textures, high dynamic range, clean edges',
        ultra: 'photorealistic, ultra detailed, tack-sharp focus, professional lighting, intricate textures, high dynamic range, crisp edges',
    },
};

const GENERATION_PREFIX = /^(please\s+)?(generate|create|make|draw|render|paint|sketch|сгенерируй(те)?|создай(те)?|нарисуй(те)?|намалюй(те)?|згенеруй(те)?)(\s+(мне|me))?(\s+(an?\s+)?(image|picture|photo|illustration|изображение|картинку|фото|рисунок))?\s*(of|:|—|-)?\s*/i;

const CYR_WORD = '[^\\s,.]+';

const LOCK_RULES = [
    {
        test: new RegExp(`золот(?:${CYR_WORD})\\s+дракон|gold(?:en)?\\s+dragon`, 'i'),
        gloss: 'golden dragon',
    },
    {
        test: new RegExp(`(?:фиолетов|лилов)(?:${CYR_WORD})\\s+молн|purple\\s+lightning|violet\\s+lightning`, 'i'),
        gloss: 'purple lightning',
    },
    {
        test: new RegExp(`ч[ёe]рн(?:${CYR_WORD})\\s+фон|black\\s+background`, 'i'),
        gloss: 'solid black background',
    },
];

const stripGenerationPrefix = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return trimmed;
    const stripped = trimmed.replace(GENERATION_PREFIX, '').trim();
    return stripped || trimmed;
};

const detectFamily = (prompt) => STYLE_FAMILIES.find((family) => family.pattern.test(prompt))?.id || null;

const resolveFamily = (style, prompt) => {
    const fromPrompt = detectFamily(prompt);
    if (style === 'anime') return 'anime';
    if (style === 'digital-art') return 'illustration';
    if (style === '3d') return '3d';
    if (fromPrompt && fromPrompt !== 'photo' && (style === 'auto' || style === 'photorealistic' || style === 'cinematic')) {
        return fromPrompt;
    }
    if (style === 'photorealistic') return 'photo';
    if (style === 'cinematic') return 'cinematic';
    return fromPrompt || 'neutral';
};

const preservationGloss = (prompt) => {
    if (!/[а-яё]/i.test(prompt)) return '';
    const locks = LOCK_RULES.filter((rule) => rule.test.test(prompt)).map((rule) => rule.gloss);
    return locks.length ? `Keep exactly: ${locks.join(', ')}.` : '';
};

/**
 * Adds quality direction without replacing the user's subject, colors, or style.
 */
const enhanceImagePrompt = ({
    prompt,
    basePrompt = '',
    editInstruction = '',
    style = 'auto',
    aspectRatio = '1:1',
    quality = 'standard',
}) => {
    const styleKey = parseStyle(style);
    const qualityKey = parseQuality(quality);
    const aspectKey = parseAspect(aspectRatio);
    const originalUserPrompt = stripGenerationPrefix(prompt);
    const anchorSource = stripGenerationPrefix(basePrompt || originalUserPrompt);
    const edit = String(editInstruction || '').trim();
    const scene = edit && basePrompt ? `${anchorSource}. ${edit}` : originalUserPrompt;
    const family = resolveFamily(styleKey, `${anchorSource} ${scene}`);
    const qualityLine = QUALITY_LINES[family][qualityKey];
    const gloss = preservationGloss(`${anchorSource} ${scene}`);

    const enhancedPrompt = [
        scene,
        gloss,
        `${qualityLine}.`,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);

    return {
        userPrompt: originalUserPrompt.slice(0, 4000),
        basePrompt: anchorSource.slice(0, 4000),
        enhancedPrompt,
        style: styleKey,
        quality: qualityKey,
        aspectRatio: aspectKey,
    };
};

const buildImagePromptPayload = (body = {}) => enhanceImagePrompt({
    prompt: typeof body.prompt === 'string' ? body.prompt.trim() : '',
    basePrompt: typeof body.basePrompt === 'string' ? body.basePrompt.trim() : '',
    editInstruction: typeof body.editInstruction === 'string' ? body.editInstruction.trim() : '',
    style: body.style,
    aspectRatio: body.aspectRatio,
    quality: body.quality,
});

module.exports = {
    enhanceImagePrompt,
    buildImagePromptPayload,
    QUALITY_LINES,
};
