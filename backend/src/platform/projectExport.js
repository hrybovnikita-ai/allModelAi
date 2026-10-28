'use strict';

const crypto = require('crypto');
const zlib = require('zlib');

const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 1_500_000;
const MAX_FILE_BYTES = 400_000;

const SECRET_NAME = /(^|\/)\.env($|\.)|(^|\/)(id_rsa|credentials\.json|service-account.*\.json)$|\.(pem|key|p12)$/i;

function assertSafePath(raw) {
    const path = String(raw || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!path || path.length > 180) {
        const error = new Error('Export path is missing or too long.');
        error.status = 400;
        throw error;
    }
    if (path.split('/').some((part) => !part || part === '.' || part === '..')) {
        const error = new Error('Export path is not allowed.');
        error.status = 400;
        throw error;
    }
    if (SECRET_NAME.test(path)) {
        const error = new Error('Secrets and environment files cannot be exported.');
        error.status = 400;
        throw error;
    }
    return path;
}

function dosDateTime(date = new Date()) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
}

function buildStoredZip(entries) {
    const { time, day } = dosDateTime();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.path, 'utf8');
        const data = Buffer.from(entry.content);
        const crc = zlib.crc32(data) >>> 0;
        const local = Buffer.alloc(30 + name.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(day, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        name.copy(local, 30);
        locals.push(local, data);
        const central = Buffer.alloc(46 + name.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(day, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        name.copy(central, 46);
        centrals.push(central);
        offset += local.length + data.length;
    }
    const centralBuf = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);
    const zip = Buffer.concat([...locals, centralBuf, end]);
    return {
        zip,
        sha256: crypto.createHash('sha256').update(zip).digest('hex'),
        files: entries.length,
        bytes: zip.length,
    };
}

function prepareExport(files, meta = {}) {
    if (!Array.isArray(files) || files.length === 0) {
        const error = new Error('At least one project file is required.');
        error.status = 400;
        throw error;
    }
    if (files.length > MAX_FILES) {
        const error = new Error(`Export is limited to ${MAX_FILES} files.`);
        error.status = 400;
        throw error;
    }
    let total = 0;
    const entries = files.map((file) => {
        const path = assertSafePath(file.path);
        const content = Buffer.from(String(file.content ?? ''), 'utf8');
        if (content.length > MAX_FILE_BYTES) {
            const error = new Error(`File ${path} exceeds the export size limit.`);
            error.status = 400;
            throw error;
        }
        total += content.length;
        return { path, content };
    });
    if (total > MAX_TOTAL_BYTES) {
        const error = new Error('Project export exceeds the total size limit.');
        error.status = 400;
        throw error;
    }
    const readme = entries.some((entry) => entry.path.toLowerCase() === 'readme.md');
    if (!readme) {
        entries.push({
            path: 'README.md',
            content: Buffer.from(`# ${String(meta.name || 'AllModelAI project').slice(0, 80)}\n\nExported from AllModelAI. Copy .env.example to a local .env and fill in your own secrets. Do not commit credentials.\n`, 'utf8'),
        });
    }
    const example = entries.some((entry) => entry.path === '.env.example');
    if (!example) {
        entries.push({
            path: '.env.example',
            content: Buffer.from('# Rename to .env locally. Do not put real secrets in the export.\nPORT=3000\n', 'utf8'),
        });
    }
    return buildStoredZip(entries);
}

function safeDownloadName(name) {
    const cleaned = String(name || 'allmodelai-project').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return `${cleaned || 'allmodelai-project'}.zip`;
}

module.exports = {
    MAX_FILES,
    MAX_TOTAL_BYTES,
    assertSafePath,
    prepareExport,
    safeDownloadName,
};
