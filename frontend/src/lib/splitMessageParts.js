import { parseFenceHeader } from './parseCodeFence.js';

const TRAILING_PROSE_RE = /\n{2,}((?:#{1,3} |\*\*(?:How|Suggested|Next)|How to run|How it works|Suggested improvements|Как |Як |Що ).[\s\S]*)$/;

/** If a model leaves the explanation inside a fence, render that tail as text. */
function detachTrailingExplanation(code, language) {
  if (/^(md|markdown|text)$/i.test(String(language || ''))) {
    return { code, trailing: '' };
  }
  const match = String(code || '').match(TRAILING_PROSE_RE);
  if (!match || match.index < 8) return { code, trailing: '' };
  return {
    code: code.slice(0, match.index).replace(/\n$/, ''),
    trailing: `\n\n${match[1]}`,
  };
}

function pushCodePart(parts, language, filename, rawCode) {
  const { code, trailing } = detachTrailingExplanation(rawCode, language);
  parts.push({ type: 'code', language, filename, value: code });
  if (trailing.trim()) parts.push({ type: 'text', value: trailing });
}

/**
 * Split assistant Markdown into text + fenced code parts.
 * Preserves newlines and indentation inside fences.
 */
export function splitMessageParts(text) {
  const source = String(text || '');
  const parts = [];
  // Allow ```python\n…``` and ```python …``` (missing newline after language).
  const codePattern = /```([\w.+#:/-]*)(?:[\t ]*\r?\n|[\t ]+)([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codePattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: source.slice(lastIndex, match.index) });
    }
    const { language, filename } = parseFenceHeader(match[1]);
    const code = String(match[2] || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
    pushCodePart(parts, language, filename, code);
    lastIndex = codePattern.lastIndex;
  }

  if (lastIndex < source.length) {
    const remainder = source.slice(lastIndex);
    const openFence = remainder.match(/(?:^|\n)[\t ]*```([\w.+#:/-]*)(?:[\t ]*\r?\n|[\t ]+|$)([\s\S]*)$/);
    if (openFence) {
      const fenceIndex = openFence.index + (openFence[0].startsWith('\n') ? 1 : 0);
      const beforeFence = remainder.slice(0, fenceIndex);
      if (beforeFence) parts.push({ type: 'text', value: beforeFence });
      const { language, filename } = parseFenceHeader(openFence[1]);
      pushCodePart(parts, language, filename, String(openFence[2] || '').replace(/\r\n/g, '\n'));
    } else {
      parts.push({ type: 'text', value: remainder });
    }
  }

  return parts;
}
