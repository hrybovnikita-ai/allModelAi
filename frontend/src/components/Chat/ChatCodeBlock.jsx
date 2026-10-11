import { useCallback, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Highlight } from 'prism-react-renderer';
import { Prism, codeTheme, languageAliases } from '../../lib/codeHighlight';
import { copyToClipboard } from '../../lib/clipboard';
import { defaultFilenameForLanguage } from '../../lib/parseCodeFence';
import './ChatCodeBlock.css';

export default function ChatCodeBlock({ language, code, filename = null, conversationId = null }) {
  const navigate = useNavigate();
  const regionId = useId();
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const prismLanguage = languageAliases[language?.toLowerCase()] || language?.toLowerCase() || 'text';
  const displayName = filename || defaultFilenameForLanguage(prismLanguage);
  const lineCount = String(code || '').split('\n').length;

  const copyCode = async () => {
    if (!await copyToClipboard(code)) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const downloadCode = () => {
    const extensions = {
      javascript: 'js', typescript: 'ts', python: 'py', bash: 'sh',
      markup: 'html', css: 'css', cpp: 'cpp', csharp: 'cs', java: 'java', json: 'json',
    };
    const extension = displayName.includes('.')
      ? displayName.split('.').pop()
      : (extensions[prismLanguage] || 'txt');
    const downloadName = displayName.includes('.') ? displayName : `allmodelai-code.${extension}`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openInWorkspace = useCallback(() => {
    navigate('/code-workspace', {
      state: {
        draft: {
          name: displayName,
          language: prismLanguage,
          content: code,
          conversationId: conversationId || null,
        },
      },
    });
  }, [code, conversationId, displayName, navigate, prismLanguage]);

  return (
    <section
      className={`response-code-block chat-code-block ${wrapped ? 'code-wrapped' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      aria-labelledby={`${regionId}-label`}
    >
      <header>
        <div className="chat-code-block-title">
          <span id={`${regionId}-label`} className="chat-code-block-lang">{language || 'code'}</span>
          {filename && <span className="chat-code-block-file">{filename}</span>}
          <span className="chat-code-block-meta">{lineCount} lines</span>
        </div>
        <div className="chat-code-block-actions">
          <button
            type="button"
            className="code-action-btn"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-controls={`${regionId}-body`}
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
          <button type="button" className="code-action-btn" onClick={openInWorkspace}>
            Open workspace
          </button>
          <button
            type="button"
            className="code-action-btn"
            onClick={() => setWrapped((value) => !value)}
            aria-label="Toggle line wrapping"
          >
            {wrapped ? 'Scroll' : 'Wrap'}
          </button>
          <button type="button" className="code-action-btn" onClick={downloadCode} aria-label="Download code">
            Download
          </button>
          <button
            type="button"
            className={`code-action-btn ${copied ? 'is-copied' : ''}`}
            onClick={copyCode}
            aria-label="Copy code"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </header>
      <div id={`${regionId}-body`} className="chat-code-block-body" hidden={collapsed}>
        <Highlight prism={Prism} theme={codeTheme} code={code} language={prismLanguage}>
          {({ className, style, tokens, getLineProps, getTokenProps }) => (
            <pre className={className} style={{ ...style, background: 'transparent' }} tabIndex={0}>
              <code>
                {tokens.map((line, lineIndex) => {
                  const lineProps = getLineProps({ line });
                  return (
                    <span {...lineProps} className={`${lineProps.className || ''} code-line`} key={lineIndex}>
                      <span className="code-line-number" aria-hidden="true">{lineIndex + 1}</span>
                      <span className="code-line-content">
                        {line.map((token, tokenIndex) => (
                          <span {...getTokenProps({ token })} key={tokenIndex} />
                        ))}
                      </span>
                    </span>
                  );
                })}
              </code>
            </pre>
          )}
        </Highlight>
      </div>
    </section>
  );
}
