/**
 * Minimal SQLite → PostgreSQL SQL translation for shared prepare() queries.
 */
function translatePlaceholders(sql, params) {
    let index = 0;
    const text = sql.replace(/\?/g, () => `$${++index}`);
    return { text, values: params };
}

function translateJsonExtract(sql) {
    return sql.replace(
        /json_extract\s*\(\s*(\w+)\s*,\s*'\$\.([^']+)'\s*\)/gi,
        "($1::jsonb ->> '$2')",
    );
}

function translateInsertOrIgnore(sql) {
    if (!/INSERT\s+OR\s+IGNORE/i.test(sql)) {
        return sql;
    }
    let next = sql.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT');
    if (!/ON\s+CONFLICT/i.test(next)) {
        next = `${next.trim()} ON CONFLICT DO NOTHING`;
    }
    return next;
}

function translateSql(sql) {
    let text = String(sql);
    text = translateInsertOrIgnore(text);
    text = translateJsonExtract(text);
    return text;
}

function insertReturningSuffix(sql) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (!/^INSERT/i.test(normalized) || /RETURNING/i.test(normalized)) {
        return '';
    }
    const match = normalized.match(/^INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]+)\)/i);
    if (!match) {
        return '';
    }
    const table = match[1].toLowerCase();
    const columns = match[2].split(',').map((part) => part.trim().toLowerCase());
    if (columns.includes('id')) {
        return '';
    }
    const tablesWithSerialId = new Set([
        'users',
        'arena_votes',
        'usage_events',
        'audit_events',
        'purchases',
    ]);
    if (tablesWithSerialId.has(table)) {
        return ' RETURNING id';
    }
    return '';
}

module.exports = {
    translatePlaceholders,
    translateSql,
    insertReturningSuffix,
};
