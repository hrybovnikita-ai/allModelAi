function isPgMissingRelationError(error, relationHint = '') {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (code === '42P01') return true;
    if (!/relation .* does not exist/i.test(message)) return false;
    if (!relationHint) return true;
    return message.toLowerCase().includes(String(relationHint).toLowerCase());
}

module.exports = {
    isPgMissingRelationError,
};
