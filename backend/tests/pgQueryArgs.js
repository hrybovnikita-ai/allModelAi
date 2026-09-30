function pgQueryText(configOrText) {
    return typeof configOrText === 'string' ? configOrText : configOrText.text;
}

function pgQueryValues(configOrText, values) {
    return typeof configOrText === 'string' ? values : configOrText.values;
}

module.exports = {
    pgQueryText,
    pgQueryValues,
};
