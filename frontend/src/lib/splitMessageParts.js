import { parseFenceHeader } from './parseCodeFence.js';

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
    // Keep internal newlines; only trim a single trailing newline from the fence closer.
    const code = String(match[2] || '').replace(/\r\n/g, '\n').replace(/\n$/, '');
    parts.push({ type: 'code', language, filename, value: code });
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
      parts.push({
        type: 'code',
        language,
        filename,
        value: String(openFence[2] || '').replace(/\r\n/g, '\n'),
      });
    } else {
      parts.push({ type: 'text', value: remainder });
    }
  }

  return parts;
}
