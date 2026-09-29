const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('tests refuse the default development sqlite path', () => {
    const previousDbFile = process.env.DB_FILE;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    process.env.DB_FILE = path.join('storage', 'database.sqlite');
    delete require.cache[require.resolve('../src/db')];
    try {
        assert.throws(
            () => require('../src/db').connectDatabase(),
            /Refusing to run tests against backend\/storage\/database\.sqlite/,
        );
    } finally {
        delete require.cache[require.resolve('../src/db')];
        if (previousDbFile === undefined) delete process.env.DB_FILE;
        else process.env.DB_FILE = previousDbFile;
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
    }
});
