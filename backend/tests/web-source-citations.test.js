const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rankSources } = require('../src/services/webSearchService');
const { computeAuthorityScore, combineRelevanceAndAuthority } = require('../src/services/webSourceAuthority');
const {
    assignCitationIds,
    diversifySources,
    isSafeHttpUrl,
    mapSourcesForClient,
} = require('../src/services/webSourceCitations');
const { extractSearchIntent } = require('../src/services/webSearchQueryBuilder');

const TRAIN_Q = 'Сколько стоит задержка поезда Киев -> Варшава Центральная';

const OFFICIAL = {
    title: 'Passenger rights — delayed trains',
    url: 'https://www.intercity.pl/en/passenger-rights',
    excerpt: 'PKP Intercity delay compensation EU regulation train Warsaw Kyiv passenger rights',
    domain: 'intercity.pl',
};

const SEO_REFUND = {
    title: 'Get train delay refund fast — ClaimCompass',
    url: 'https://claimcompass.example/refund-train',
    excerpt: 'Train delay compensation claim service Warsaw Kyiv refund money back',
    domain: 'claimcompass.example',
};

const IRRELEVANT_GOV = {
    title: 'US Department of Agriculture — Home',
    url: 'https://www.usda.gov/',
    excerpt: 'United States Department of Agriculture programs',
    domain: 'usda.gov',
};

test('A: official source outranks relevant SEO/refund site', () => {
    const intent = extractSearchIntent(TRAIN_Q);
    const officialAuth = computeAuthorityScore(OFFICIAL, intent);
    const seoAuth = computeAuthorityScore(SEO_REFUND, intent);
    assert.ok(officialAuth.authorityScore > seoAuth.authorityScore);
    const ranked = rankSources(TRAIN_Q, [SEO_REFUND, OFFICIAL], 4);
    assert.equal(ranked[0].domain, 'intercity.pl');
});

test('B: irrelevant government source does not beat highly relevant operator source', () => {
    const ranked = rankSources(TRAIN_Q, [IRRELEVANT_GOV, OFFICIAL], 4);
    if (ranked.length) assert.equal(ranked[0].domain, 'intercity.pl');
    assert.equal(ranked.some((s) => s.domain === 'usda.gov'), false);
});

test('C: duplicate URLs are removed during diversification', () => {
    const dup = { ...OFFICIAL, title: 'Copy title' };
    const diverse = diversifySources(assignCitationIds([OFFICIAL, dup, OFFICIAL]), 6);
    assert.equal(diverse.length, 1);
});

test('D: citation IDs remain stable after ranking', () => {
    const ranked = rankSources(TRAIN_Q, [SEO_REFUND, OFFICIAL], 6);
    ranked.forEach((source, index) => {
        assert.equal(source.citationId, index + 1);
        assert.equal(source.rank, source.citationId);
    });
});

test('E: mapSourcesForClient preserves citationId for frontend cards', () => {
    const client = mapSourcesForClient(assignCitationIds([OFFICIAL]));
    assert.equal(client[0].citationId, 1);
    assert.equal(client[0].rank, 1);
});

test('G: unsafe URL protocols are rejected', () => {
    assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
    assert.equal(isSafeHttpUrl('https://intercity.pl/en'), true);
});

test('combine score requires relevance pass', () => {
    assert.equal(combineRelevanceAndAuthority(90, 95, false), -100);
    assert.ok(combineRelevanceAndAuthority(80, 90, true) > combineRelevanceAndAuthority(80, 30, true));
});
