/**
 * Generic authority tiers for web search results (relevance still gates inclusion).
 */

const { extractSearchIntent } = require('./webSearchQueryBuilder');

/** @typedef {'government_regulator'|'official_operator'|'international_public'|'news'|'encyclopedia'|'secondary'|'commercial_seo'|'low_quality'} SourceType */

const TIER_BY_TYPE = {
    government_regulator: 1,
    official_operator: 1,
    international_public: 1,
    news: 2,
    encyclopedia: 3,
    secondary: 3,
    commercial_seo: 4,
    low_quality: 5,
};

const COMMERCIAL_SEO = /refund|claim.?service|get.?compensation|money.?back|class.?action.?lead|seo|affiliate|coupon/i;
const LOW_QUALITY_HOST = /pinterest|freepik|quora\.com\/|answers\.yahoo|spam/i;
const NEWS_HOST = /reuters\.|bbc\.(com|co\.uk)|apnews\.|npr\.org|theguardian\.|nytimes\.|techcrunch\.|theverge\.|bloomberg\./i;
const ENCYCLOPEDIA_HOST = /wikipedia\.org|britannica\.com|wikivoyage\.org/i;

const operatorHintFromIntent = (intent) => {
    const hints = [];
    const blob = `${intent.raw} ${(intent.concepts.locations || []).join(' ')}`.toLowerCase();
    if (/pkp|intercity|poland|warsaw|варшав/i.test(blob)) hints.push('pkp.pl', 'intercity.pl', 'utk.gov.pl');
    if (/ukr|kyiv|kiev|киев|укр|uz\./i.test(blob)) hints.push('uz.gov.ua', 'ukrzaliznytsia');
    if (/eu|rail|passenger rights|compensation/i.test(blob)) hints.push('europa.eu', 'ec.europa.eu');
    return hints;
};

const classifySourceType = (source, intent) => {
    const host = String(source.domain || '').toLowerCase();
    const url = String(source.url || '').toLowerCase();
    const title = String(source.title || '').toLowerCase();
    const blob = `${host} ${url} ${title} ${source.excerpt || ''}`.toLowerCase();

    if (LOW_QUALITY_HOST.test(blob)) return 'low_quality';
    if (COMMERCIAL_SEO.test(blob) && !/\.gov|intercity|pkp\.pl|uz\.gov/.test(host)) return 'commercial_seo';

    if (/\.gov(\.|$)|\.gouv\.|gov\.ua|gov\.pl/.test(host)) return 'government_regulator';
    if (/europa\.eu|ec\.europa\.eu|europarl\.europa/.test(host)) return 'international_public';

    const operatorHints = operatorHintFromIntent(intent);
    if (operatorHints.some((hint) => host.includes(hint.replace(/^https?:\/\//, '')) || url.includes(hint))) {
        return 'official_operator';
    }

    if (/intercity\.pl|pkp\.pl|uz\.gov|ukrzaliznytsia|railway|railcompany|amtrak\.com|eurostar\.com/.test(blob)) {
        return 'official_operator';
    }

    if (ENCYCLOPEDIA_HOST.test(host)) return 'encyclopedia';
    if (NEWS_HOST.test(host)) return 'news';
    if (/support\.|docs\.|help\./i.test(url) && /official|documentation|passenger rights|terms/i.test(blob)) {
        return 'secondary';
    }
    if (/\.edu(\.|$)/.test(host)) return 'secondary';

    return 'secondary';
};

const computeAuthorityScore = (source, intent) => {
    const sourceType = classifySourceType(source, intent);
    const tier = TIER_BY_TYPE[sourceType] || 4;
    let score = 100 - (tier - 1) * 18;

    const host = String(source.domain || '').toLowerCase();
    const blob = `${host} ${source.url || ''} ${source.title || ''}`.toLowerCase();

    if (sourceType === 'government_regulator' || sourceType === 'international_public') score = Math.max(score, 88);
    if (sourceType === 'official_operator') score = Math.max(score, 85);

    if (sourceType === 'commercial_seo') score = Math.min(score, 35);
    if (sourceType === 'low_quality') score = Math.min(score, 15);

    if (ENCYCLOPEDIA_HOST.test(host)) {
        if (intent.isGeneralKnowledge && !intent.isOperationalCurrent) score = Math.max(score, 72);
        else if (intent.isOperationalCurrent) score = Math.min(score, 40);
    }

    if (intent.isOperationalCurrent && sourceType === 'news') score += 4;
    if (intent.isNews && sourceType === 'news') score += 8;

    operatorHintFromIntent(intent).forEach((hint) => {
        if (blob.includes(hint.replace(/^https?:\/\//, ''))) score += 6;
    });

    return {
        sourceType,
        authorityTier: tier,
        authorityScore: Math.max(0, Math.min(100, Math.round(score))),
    };
};

const combineRelevanceAndAuthority = (relevanceScore, authorityScore, relevancePassed) => {
    if (!relevancePassed || relevanceScore <= 0) return -100;
    return Math.round(relevanceScore * 0.68 + authorityScore * 0.32);
};

module.exports = {
    classifySourceType,
    combineRelevanceAndAuthority,
    computeAuthorityScore,
    TIER_BY_TYPE,
};
