import { useMemo } from 'react';
import ChatCodeBlock from './ChatCodeBlock';
import { buildCitationSourceMap, isSafeHttpUrl, scrollToSourceCard, splitCitationSegments } from '../../lib/citationLinks.js';
import { splitRichTextSegments } from '../../lib/chatMessageLinks.js';
import { splitMessageParts } from '../../lib/splitMessageParts.js';

function InlineFormattedText({ children }) {
  const segments = splitRichTextSegments(String(children));
  return segments.map((segment, index) => {
    if (segment.type === 'link') {
      return (
        <a
          key={`lnk-${index}`}
          href={segment.url}
          className="chat-inline-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          {segment.label}
        </a>
      );
    }
    const tokens = segment.value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return tokens.map((token, tokenIndex) => {
      const key = `${index}-${tokenIndex}`;
      if (token.startsWith('`') && token.endsWith('`')) return <code className="inline-code" key={key}>{token.slice(1, -1)}</code>;
      if (token.startsWith('**') && token.endsWith('**')) return <strong key={key}>{token.slice(2, -2)}</strong>;
      return token;
    });
  });
}

function InlineText({ children, citationMap }) {
  const raw = String(children);
  if (!citationMap?.size) return <InlineFormattedText>{raw}</InlineFormattedText>;

  return splitCitationSegments(raw).map((segment, index) => {
    const cite = segment.match(/^\[(\d+)\]$/);
    if (!cite) return <InlineFormattedText key={`t-${index}`}>{segment}</InlineFormattedText>;

    const id = Number(cite[1]);
    const source = citationMap.get(id);
    if (source && isSafeHttpUrl(source.url)) {
      return (
        <a
          key={`c-${index}`}
          href={source.url}
          className="inline-citation"
          title={source.title || source.domain || `Source ${id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault();
            scrollToSourceCard(id);
            globalThis.open(source.url, '_blank', 'noopener,noreferrer');
          }}
        >
          [{id}]
        </a>
      );
    }
    return <span key={`c-${index}`} className="inline-citation inline-citation-invalid" title="Citation unavailable">[{id}]</span>;
  });
}

function MarkdownTable({ rows }) {
  if (!rows.length) return null;
  const [header, ...body] = rows;
  return (
    <div className="chat-markdown-table-wrap">
      <table className="chat-markdown-table">
        <thead>
          <tr>{header.map((cell, index) => <th key={index}><InlineText>{cell.trim()}</InlineText></th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}><InlineText>{cell.trim()}</InlineText></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseTableBlock(lines) {
  if (lines.length < 2) return null;
  const divider = lines[1];
  if (!/^\s*\|?[\s:-]+\|[\s|:-]+\|?\s*$/.test(divider)) return null;
  const rows = lines
    .filter((_, index) => index !== 1)
    .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  if (rows.some((row) => row.length < 2)) return null;
  return rows;
}

function TextBlock({ value, citationMap }) {
  const lines = value.trim().split(/\r?\n/);
  const elements = [];
  let list = [];
  let tableBuffer = null;

  const flushList = () => {
    if (!list.length) return;
    elements.push(
      <ul key={`list-${elements.length}`}>
        {list.map((item, index) => (
          <li key={index}><InlineText citationMap={citationMap}>{item}</InlineText></li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushTable = () => {
    if (!tableBuffer?.length) {
      tableBuffer = null;
      return;
    }
    const parsed = parseTableBlock(tableBuffer);
    if (parsed) elements.push(<MarkdownTable key={`table-${elements.length}`} rows={parsed} />);
    else tableBuffer.forEach((line, index) => {
      if (line.trim()) elements.push(<p key={`tbl-fallback-${elements.length}-${index}`}><InlineText citationMap={citationMap}>{line}</InlineText></p>);
    });
    tableBuffer = null;
  };

  lines.forEach((line, index) => {
    if (/^\s*\|.+\|\s*$/.test(line)) {
      flushList();
      if (!tableBuffer) tableBuffer = [];
      tableBuffer.push(line);
      return;
    }
    flushTable();

    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (bullet) {
      list.push(bullet[1]);
      return;
    }
    flushList();
    const heading = line.match(/^\s*(#{1,3})\s+(.+)/);
    if (heading) {
      const Tag = `h${Math.min(heading[1].length + 2, 5)}`;
      elements.push(<Tag key={index}><InlineText citationMap={citationMap}>{heading[2]}</InlineText></Tag>);
    } else if (line.trim()) {
      elements.push(<p key={index}><InlineText citationMap={citationMap}>{line}</InlineText></p>);
    }
  });

  flushList();
  flushTable();
  return elements;
}

export default function ChatMessageContent({ text, streaming, citationSources, conversationId = null }) {
  const citationMap = useMemo(() => buildCitationSourceMap(citationSources), [citationSources]);
  const parts = useMemo(() => splitMessageParts(String(text || '')), [text]);

  return (
    <div className="message-content">
      {parts.map((part, index) => (
        part.type === 'code'
          ? (
            <ChatCodeBlock
              key={`code-${index}`}
              language={part.language}
              filename={part.filename}
              code={part.value}
              conversationId={conversationId}
            />
          )
          : part.value.trim() && <TextBlock value={part.value} citationMap={citationMap} key={`text-${index}`} />
      ))}
      {streaming && <i className="stream-cursor" aria-hidden="true" />}
    </div>
  );
}
