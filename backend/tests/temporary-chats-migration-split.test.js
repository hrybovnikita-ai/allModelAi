const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { splitSqlStatements } = require('../src/db/postgresSchemaBootstrap');

test('015 temporary chats SQL does not break on comment semicolons', () => {
    const sql = fs.readFileSync(
        path.join(__dirname, '..', 'migrations', '015_temporary_chats.sql'),
        'utf8',
    );
    assert.match(sql, /messages do not extend/);
    assert.doesNotMatch(sql, /creation; messages/);

    const statements = splitSqlStatements(sql);
    assert.equal(statements.length, 4);
    assert.match(statements[0], /ADD COLUMN IF NOT EXISTS is_temporary/i);
    assert.match(statements[1], /ADD COLUMN IF NOT EXISTS expires_at/i);
    assert.match(statements[2], /conversations_temporary_expires/i);
    assert.match(statements[3], /conversations_owner_temporary/i);
});

test('splitSqlStatements strips line comments that contain semicolons', () => {
    const statements = splitSqlStatements(`
-- note: fixed from creation; messages do not extend.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
`);
    assert.deepEqual(statements, [
        'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT FALSE',
        'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ',
    ]);
});
