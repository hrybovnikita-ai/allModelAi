function extractPasswordHash(row) {
    if (!row || typeof row !== 'object') {
        return null;
    }
    const value = row.password_hash
        ?? row.passwordHash
        ?? row.passwordhash
        ?? null;
    return typeof value === 'string' && value.length ? value : null;
}

function classifyPasswordHashType(passwordHash) {
    if (!passwordHash || typeof passwordHash !== 'string') {
        return 'missing';
    }
    if (/^\$2[aby]\$\d+\$/.test(passwordHash)) {
        return 'bcrypt';
    }
    if (passwordHash.includes(':')) {
        return 'scrypt';
    }
    return 'unknown';
}

function isValidPasswordHashFormat(passwordHash) {
    const type = classifyPasswordHashType(passwordHash);
    if (type === 'missing') {
        return false;
    }
    if (type === 'bcrypt') {
        return passwordHash.length >= 59;
    }
    if (type === 'scrypt') {
        const separatorIndex = passwordHash.indexOf(':');
        const storedKey = separatorIndex >= 0 ? passwordHash.slice(separatorIndex + 1) : '';
        return separatorIndex > 0 && storedKey.length > 0;
    }
    return false;
}

function mapAuthUserRow(row) {
    if (!row) {
        return null;
    }
    const passwordHash = extractPasswordHash(row);
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        avatar: row.avatar ?? row.avatar_url ?? null,
        passwordHash,
    };
}

module.exports = {
    classifyPasswordHashType,
    extractPasswordHash,
    isValidPasswordHashFormat,
    mapAuthUserRow,
};
