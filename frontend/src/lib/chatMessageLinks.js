import { isSafeHttpUrl } from './citationLinks.js';

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const BARE_URL_RE = /https?:\/\/[^\s<>()[\]"']+/g;

export function splitRichTextSegments(text) {
  const input = String(text || '');
  const segments = [];
  let cursor = 0;
  const combined = [];

  const pushPlain = (start, end) => {
    if (end > start) combined.push({ type: 'text', value: input.slice(start, end) });
  };

  MARKDOWN_LINK_RE.lastIndex = 0;
  let match;
  while ((match = MARKDOWN_LINK_RE.exec(input)) !== null) {
    pushPlain(cursor, match.index);
    const url = match[2].trim();
    if (isSafeHttpUrl(url)) {
      combined.push({ type: 'link', label: match[1], url });
    } else {
      combined.push({ type: 'text', value: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  pushPlain(cursor, input.length);

  combined.forEach((part) => {
    if (part.type === 'link') {
      segments.push(part);
      return;
    }
    let localCursor = 0;
    const chunk = part.value;
    BARE_URL_RE.lastIndex = 0;
    let urlMatch;
    while ((urlMatch = BARE_URL_RE.exec(chunk)) !== null) {
      if (urlMatch.index > localCursor) {
        segments.push({ type: 'text', value: chunk.slice(localCursor, urlMatch.index) });
      }
      const url = urlMatch[0].replace(/[.,;:!?)]+$/, '');
      if (isSafeHttpUrl(url)) {
        segments.push({ type: 'link', label: url, url });
      } else {
        segments.push({ type: 'text', value: urlMatch[0] });
      }
      localCursor = urlMatch.index + urlMatch[0].length;
    }
    if (localCursor < chunk.length) {
      segments.push({ type: 'text', value: chunk.slice(localCursor) });
    }
  });

  return segments.length ? segments : [{ type: 'text', value: input }];
}
