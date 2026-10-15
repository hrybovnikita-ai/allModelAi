const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    isAllowedZillizHost,
    extractEndpointCandidate,
    normalizeZillizEndpoint,
    upsertZillizUri,
    hostHint,
} = require('../src/services/zilliz/zillizEndpoint');

test('accepts classic zillizcloud.com HTTPS endpoints with optional port', () => {
    const a = normalizeZillizEndpoint('https://in01-xxxx.api.gcp-us-west1.zillizcloud.com:19530');
    assert.equal(a.ok, true);
    assert.match(a.value, /^https:\/\/in01-xxxx\.api\.gcp-us-west1\.zillizcloud\.com:19530$/);

    const b = normalizeZillizEndpoint('https://in01-xxxx.api.gcp-us-west1.zillizcloud.com');
    assert.equal(b.ok, true);
    assert.equal(b.port, '');
});

test('accepts serverless cluster hosts under cloud.zilliz.com and rejects region roots', () => {
    assert.equal(isAllowedZillizHost('aws-eu-central-1.cloud.zilliz.com'), false);
    assert.equal(isAllowedZillizHost('in03-abc.serverless.aws-eu-central-1.cloud.zilliz.com'), true);

    const bare = normalizeZillizEndpoint('xxxx.aws-eu-central-1.cloud.zilliz.com');
    assert.equal(bare.ok, true);
    assert.equal(bare.value, 'https://xxxx.aws-eu-central-1.cloud.zilliz.com');

    assert.equal(normalizeZillizEndpoint('aws-eu-central-1.cloud.zilliz.com').ok, false);

    // Non-default ports are preserved (URL omits default 443 for https).
    const withPort = normalizeZillizEndpoint('https://xxxx.aws-eu-central-1.cloud.zilliz.com:19530');
    assert.equal(withPort.ok, true);
    assert.equal(withPort.port, '19530');
    assert.equal(withPort.value, 'https://xxxx.aws-eu-central-1.cloud.zilliz.com:19530');
});

test('extracts endpoint from multi-line / HTML clipboard without requiring whole string to be URL', () => {
    const messy = [
        'Cluster details',
        'Public Endpoint',
        'aws-eu-central-1.cloud.zilliz.com',
        'xxxx.aws-eu-central-1.cloud.zilliz.com',
        'Token: do-not-use-this-line',
        '<a href="https://yyyy.serverless.aws-eu-central-1.cloud.zilliz.com">Connect</a>',
    ].join('\n');

    const extracted = extractEndpointCandidate(messy);
    assert.match(extracted, /cloud\.zilliz\.com/i);
    assert.doesNotMatch(extracted, /^https?:\/\/aws-eu-central-1\.cloud\.zilliz\.com$/i);

    const normalized = normalizeZillizEndpoint(messy, { allowExtract: true });
    assert.equal(normalized.ok, true);
    // Prefer the most specific serverless host
    assert.equal(normalized.value, 'https://yyyy.serverless.aws-eu-central-1.cloud.zilliz.com');
    assert.doesNotMatch(normalized.value, /Token|do-not-use/i);
});

test('clipboard with only region root fails instead of saving unusable host', () => {
    const result = normalizeZillizEndpoint('Region\naws-eu-central-1.cloud.zilliz.com\n', {
        sourceLabel: 'Clipboard',
        allowExtract: true,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /cluster id|Public Endpoint/i);
});

test('diagnoseClipboardText reports missing cluster id safely', () => {
    const {
        diagnoseClipboardText,
    } = require('../src/services/zilliz/zillizEndpoint');
    const diagnosis = diagnoseClipboardText(
        'Public Endpoint\nserverless\naws-eu-central-1.cloud.zilliz.com\n',
    );
    assert.equal(diagnosis.likelyMissingClusterId, true);
    assert.equal(diagnosis.usableCandidateCount, 0);
    assert.ok(diagnosis.regionRootCount >= 1);
    assert.equal('text' in diagnosis, false);
});

test('rejects unrelated domains and embedded credentials', () => {
    assert.equal(normalizeZillizEndpoint('https://example.com').ok, false);
    assert.equal(
        normalizeZillizEndpoint('https://user:pass@xxxx.aws-eu-central-1.cloud.zilliz.com').ok,
        false,
    );
});

test('upsertZillizUri updates only ZILLIZ_URI line', () => {
    const before = [
        'ZILLIZ_API_USER=db_admin',
        'ZILLIZ_API_PASSWORD=keep-me',
        'ZILLIZ_URI=',
        'ZILLIZ_TOKEN=',
        'ZILLIZ_COLLECTION=allmodelai_user_memory',
    ].join('\n');
    const after = upsertZillizUri(before, 'https://xxxx.aws-eu-central-1.cloud.zilliz.com');
    assert.match(after, /^ZILLIZ_URI=https:\/\/xxxx\.aws-eu-central-1\.cloud\.zilliz\.com$/m);
    assert.match(after, /^ZILLIZ_API_PASSWORD=keep-me$/m);
    assert.match(after, /^ZILLIZ_API_USER=db_admin$/m);
    assert.match(after, /^ZILLIZ_TOKEN=$/m);
});

test('hostHint never returns the full hostname for long hosts', () => {
    const hint = hostHint('https://abcdef.aws-eu-central-1.cloud.zilliz.com');
    assert.ok(hint.includes('…'));
    assert.notEqual(hint, 'abcdef.aws-eu-central-1.cloud.zilliz.com');
});

test('clipboard failure path surfaces clear reason when no endpoint present', () => {
    const result = normalizeZillizEndpoint('Configure the Zilliz Cloud connection\nfor AllModelAI', {
        sourceLabel: 'Clipboard',
        allowExtract: true,
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /Clipboard/i);
});
