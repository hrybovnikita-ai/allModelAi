'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
    parseArgs,
    resolveSqlitePath,
    stamp,
} = require('../scripts/db-backup');

test('db-backup helpers parse args and stamp', () => {
    const parsed = parseArgs(['--out', '/tmp/backups', '--dry-run']);
    assert.equal(parsed.outDir, '/tmp/backups');
    assert.equal(parsed.dryRun, true);
    assert.match(stamp(), /^\d{8}-\d{6}$/);
});

test('db-backup dry-run for sqlite fixture does not write files', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-backup-'));
    const dbPath = path.join(directory, 'fixture.sqlite');
    const outDir = path.join(directory, 'out');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);');
    db.close();

    const previousDb = process.env.DB_FILE;
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    process.env.DB_FILE = dbPath;

    try {
        assert.equal(resolveSqlitePath(), dbPath);
        const { main } = require('../scripts/db-backup');
        // Re-invoke with dry-run via argv simulation
        const originalArgv = process.argv;
        process.argv = ['node', 'db-backup.js', '--out', outDir, '--dry-run'];
        main();
        process.argv = originalArgv;
        assert.equal(fs.existsSync(outDir), false);
    } finally {
        if (previousDb === undefined) delete process.env.DB_FILE;
        else process.env.DB_FILE = previousDb;
        if (previousUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousUrl;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('sqlite backup copies file when not dry-run', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allmodelai-backup-'));
    const dbPath = path.join(directory, 'fixture.sqlite');
    const outDir = path.join(directory, 'out');
    const db = new Database(dbPath);
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT); INSERT INTO users VALUES (1, \'a@b.c\');');
    db.close();

    const previousDb = process.env.DB_FILE;
    const previousUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    process.env.DB_FILE = dbPath;

    try {
        const { main } = require('../scripts/db-backup');
        const originalArgv = process.argv;
        process.argv = ['node', 'db-backup.js', '--out', outDir];
        main();
        process.argv = originalArgv;
        const files = fs.readdirSync(outDir).filter((name) => name.endsWith('.sqlite'));
        assert.equal(files.length, 1);
        const restored = new Database(path.join(outDir, files[0]), { readonly: true });
        const row = restored.prepare('SELECT email FROM users WHERE id = 1').get();
        restored.close();
        assert.equal(row.email, 'a@b.c');
    } finally {
        if (previousDb === undefined) delete process.env.DB_FILE;
        else process.env.DB_FILE = previousDb;
        if (previousUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousUrl;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
