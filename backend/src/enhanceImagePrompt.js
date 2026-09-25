const STYLE_HINTS = {
    auto: '',
    photorealistic: 'Photorealistic rendering, natural lighting, realistic textures.',
    cinematic: 'Cinematic composition, dramatic lighting, film still quality.',
    anime: 'Anime illustration style, clean linework, expressive shading.',
    'digital-art': 'Polished digital illustration, concept art quality.',
    '3d': 'High-quality 3D render, realistic materials and lighting.',
};

const QUALITY_HINTS = {
    standard: 'Balanced detail and clarity.',
    high: 'Ultra detailed, sharp focus, rich textures, high fidelity output.',
};

const ASPECT_SIZES = {
    '1:1': '1024x1024',
    '16:9': '1344x768',
    '9:16': '768x1344',
};

const GENERATION_PREFIX = /^(please\s+)?(generate|create|make|draw|render|paint|sketch|сгенерируй(те)?|создай(те)?|нарисуй(те)?|намалюй(те)?|згенеруй(те)?)(\s+(мне|me))?(\s+(an?\s+)?(image|picture|photo|illustration|изображение|картинку|фото|рисунок))?\s*(of|:|—|-)?\s*/i;

const COLOR_PATTERNS = [
    /\b(golden|gold|silver|purple|violet|black|white|red|blue|green|orange|yellow|pink|cyan|teal|brown|grey|gray)\s+([a-z][a-z-]{2,})/gi,
    /\b(золот(?:ой|ого|ая|ые|ым|ом|ую|ыми|ое))\s+([a-zа-яё-]{3,})/gi,
    /\b(фиолетов(?:ый|ые|ая|ую|ым|ом|ыми)|лилов(?:ый|ые|ая|ую|ым|ом|ыми))\s+([a-zа-яё-]{3,})/gi,
    /\b(чёрн(?:ый|ого|ая|ое|ом|ую|ыми)|черн(?:ый|ого|ая|ое|ом|ую|ыми))\s+([a-zа-яё-]{3,})/gi,
    /\b(on|against|with)\s+(a\s+)?(black|white|dark|light)\s+(background|backdrop|sky)\b/gi,
    /\b(на|против)\s+(чёрн(?:ом|ого)|черн(?:ом|ого)|бел(?:ом|ого))\s+(фон(?:е)?|неб(?:е)?)\b/gi,
    /(?:^|\s)с\s+фиолетов(?:[^\s,.]+)\s+молн(?:[^\s,.]+)?/gi,
    /\bwith\s+purple\s+lightning\b/gi,
];

const CYR_WORD = '[^\\s,.]+';

const SCENE_REWRITES = [
    [new RegExp(`золот(?:${CYR_WORD})\\s+дракон(?:${CYR_WORD})?`, 'gi'), 'golden dragon with gold metallic scales'],
    [/gold(?:en)?\s+dragon/gi, 'golden dragon with gold metallic scales'],
    [new RegExp(`фиолетов(?:${CYR_WORD})\\s+молн(?:${CYR_WORD})?`, 'gi'), 'purple violet lightning bolts'],
    [/purple\s+lightning/gi, 'purple violet lightning bolts'],
    [/violet\s+lightning/gi, 'purple violet lightning bolts'],
    [new RegExp(`на\\s+ч[ёe]рн(?:${CYR_WORD})\\s+фон(?:${CYR_WORD})?`, 'gi'), 'on solid black background'],
    [/black\s+background/gi, 'on solid black background'],
];

const stripGenerationPrefix = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return trimmed;
    const stripped = trimmed.replace(GENERATION_PREFIX, '').trim();
    return stripped || trimmed;
};

const uniqueList = (items) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];

const extractAnchorRequirements = (corePrompt) => {
    const anchors = [];
    for (const pattern of COLOR_PATTERNS) {
        const regex = new RegExp(pattern.source, pattern.flags);
        const matches = corePrompt.matchAll(regex);
        for (const match of matches) {
            if (match[0]) anchors.push(match[0].replace(/\s+/g, ' ').trim());
        }
    }
    return uniqueList(anchors);
};

const extractSemanticLocks = (corePrompt) => {
    const text = String(corePrompt || '');
    const lower = text.toLowerCase();
    const locks = [];

    const goldDragon = new RegExp(`золот(?:${CYR_WORD})\\s+дракон`, 'i');
    const purpleLightning = new RegExp(`(?:фиолетов|лилов)(?:${CYR_WORD})\\s+молн`, 'i');
    const blackBg = new RegExp(`(?:ч[ёe]рн(?:${CYR_WORD})\\s+фон|на\\s+ч[ёe]рн(?:${CYR_WORD})\\s+фон)`, 'i');

    if (goldDragon.test(text) || /gold(?:en)?\s+dragon|golden dragon/i.test(text)) {
        locks.push('golden dragon with gold metallic scales (NOT pink, NOT red, NOT rose)');
    } else if (/дракон|dragon/i.test(text)) {
        locks.push('dragon');
    }

    if (
        purpleLightning.test(text)
        || new RegExp(`(?:с\\s+)?(?:фиолетов|лилов)(?:${CYR_WORD})\\s+молн`, 'i').test(text)
        || /purple\s+lightning|violet\s+lightning/i.test(text)
    ) {
        locks.push('purple and violet lightning bolts');
    }

    if (blackBg.test(text) || /black\s+background/i.test(text)) {
        locks.push('solid black background');
    }

    return uniqueList(locks);
};

const buildNegativeLocks = (semanticLocks) => {
    const negatives = [];
    const joined = semanticLocks.join(' ').toLowerCase();

    if (joined.includes('golden dragon')) {
        negatives.push('no pink dragon', 'no red dragon', 'no cute chibi toy dragon unless requested');
    }
    if (joined.includes('purple') && joined.includes('lightning')) {
        negatives.push('no blue-only lightning', 'no yellow lightning replacing purple');
    }
    if (joined.includes('black background')) {
        negatives.push('no white background', 'no gray studio backdrop');
    }

    return uniqueList(negatives);
};

const toEnglishSceneLine = (corePrompt) => {
    let scene = String(corePrompt || '').trim();
    for (const [pattern, replacement] of SCENE_REWRITES) {
        scene = scene.replace(pattern, replacement);
    }
    return scene.replace(/\s+/g, ' ').trim();
};

const normalizeStyle = (value) => {
    const key = String(value || 'auto').trim().toLowerCase();
    return STYLE_HINTS[key] !== undefined ? key : 'auto';
};

const normalizeQuality = (value) => {
    const key = String(value || 'standard').trim().toLowerCase();
    return QUALITY_HINTS[key] ? key : 'standard';
};

const normalizeAspect = (value) => {
    const key = String(value || '1:1').trim();
    return ASPECT_SIZES[key] ? key : '1:1';
};

/**
 * Improves prompt for image models while preserving the user's core requirements.
 */
const enhanceImagePrompt = ({
    prompt,
    basePrompt = '',
    editInstruction = '',
    style = 'auto',
    aspectRatio = '1:1',
    quality = 'standard',
}) => {
    const styleKey = normalizeStyle(style);
    const qualityKey = normalizeQuality(quality);
    const aspectKey = normalizeAspect(aspectRatio);

    const originalUserPrompt = stripGenerationPrefix(prompt);
    const anchorSource = stripGenerationPrefix(basePrompt || originalUserPrompt);
    const edit = String(editInstruction || '').trim();

    let corePrompt = originalUserPrompt;
    if (edit && basePrompt) {
        corePrompt = `${anchorSource}. ${edit}`;
    }

    const regexAnchors = extractAnchorRequirements(`${anchorSource} ${corePrompt}`);
    const semanticLocks = extractSemanticLocks(`${anchorSource} ${corePrompt}`);
    const anchors = uniqueList([...semanticLocks, ...regexAnchors]);
    const negatives = buildNegativeLocks(semanticLocks);
    const englishScene = semanticLocks.length
        ? semanticLocks.join(', ')
        : toEnglishSceneLine(corePrompt);

    const anchorBlock = anchors.length
        ? `Must preserve exactly: ${anchors.join('; ')}.`
        : `Must preserve exactly all subjects, colors, counts, and scene elements from: "${corePrompt}".`;

    const enhancedPrompt = [
        anchors.length ? `Primary subject and colors: ${anchors.join(', ')}.` : '',
        englishScene ? `Scene: ${englishScene}.` : corePrompt,
        edit ? `Adjustments: ${edit}.` : '',
        anchorBlock,
        'Do not replace, recolor, or remove specified subjects. Do not change dragon color away from user request.',
        negatives.length ? `Avoid: ${negatives.join(', ')}.` : '',
        STYLE_HINTS[styleKey],
        QUALITY_HINTS[qualityKey],
        'Strong prompt adherence, coherent composition, clean edges.',
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);

    return {
        userPrompt: originalUserPrompt.slice(0, 4000),
        basePrompt: anchorSource.slice(0, 4000),
        enhancedPrompt,
        style: styleKey,
        quality: qualityKey,
        aspectRatio: aspectKey,
        aspectSize: ASPECT_SIZES[aspectKey],
    };
};

const buildImagePromptPayload = (body = {}) => {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const basePrompt = typeof body.basePrompt === 'string' ? body.basePrompt.trim() : '';
    const editInstruction = typeof body.editInstruction === 'string' ? body.editInstruction.trim() : '';

    return enhanceImagePrompt({
        prompt,
        basePrompt,
        editInstruction,
        style: body.style,
        aspectRatio: body.aspectRatio,
        quality: body.quality,
    });
};

module.exports = {
    enhanceImagePrompt,
    buildImagePromptPayload,
    ASPECT_SIZES,
    STYLE_HINTS,
    QUALITY_HINTS,
};
