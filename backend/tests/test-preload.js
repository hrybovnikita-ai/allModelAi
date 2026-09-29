const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.NODE_ENV = 'test';

if (!process.env.DB_FILE) {
    process.env.DB_FILE = path.join(
        os.tmpdir(),
        `allmodelai-test-${process.pid}-${Date.now()}.sqlite`,
    );
}

const resolved = path.isAbsolute(process.env.DB_FILE)
    ? process.env.DB_FILE
    : path.resolve(__dirname, '..', process.env.DB_FILE);

try {
    fs.rmSync(resolved, { force: true });
} catch {
    /* ignore */
}

process.on('exit', () => {
    try {
        fs.rmSync(resolved, { force: true });
    } catch {
        /* ignore */
    }
});
