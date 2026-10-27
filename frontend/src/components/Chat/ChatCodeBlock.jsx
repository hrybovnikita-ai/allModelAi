import { useCallback, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Highlight } from 'prism-react-renderer';
import { Prism, codeTheme, languageAliases } from '../../lib/codeHighlight';
import { copyToClipboard } from '../../lib/clipboard';
import { apiFetch } from '../../lib/api';
import { defaultFilenameForLanguage } from '../../lib/parseCodeFence';
import './ChatCodeBlock.css';

export default function ChatCodeBlock({ language, code, filename = null, conversationId = null }) {
  const navigate = useNavigate();
  const regionId = useId();
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [assist, setAssist] = useState(null);
  const [assistError, setAssistError] = useState('');
  const [assistBusy, setAssistBusy] = useState(false);
  const [showFixed, setShowFixed] = useState(false);

  const runAssist = async (mode) => {
    setAssistBusy(true);
    setAssistError('');
    try {
      const response = await apiFetch('/api/code/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, code, language: prismLanguage }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Code assistant could not run.');
      setAssist(data);
      setShowFixed(false);
    } catch (error) {
      setAssistError(error.message || 'Code assistant could not run.');
    } finally {
      setAssistBusy(false);
    }
  };

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
          <button type="button" className="code-action-btn" disabled={assistBusy} onClick={() => runAssist('analyze')}>Check</button>
          <button type="button" className="code-action-btn" disabled={assistBusy} onClick={() => runAssist('fix')}>Fix code</button>
          <button type="button" className="code-action-btn" disabled={assistBusy} onClick={() => runAssist('explain')}>Explain</button>
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
      {assistError ? <p className="code-assist-note" role="alert">{assistError}</p> : null}
      {assist ? (
        <div className="code-assist-panel" role="status">
          <p>Static check only. This code was not executed.</p>
          {assist.confirmed?.length ? <ul>{assist.confirmed.map((item) => <li key={item.message}>Confirmed: {item.message}</li>)}</ul> : <p>No confirmed problems from the static checker.</p>}
          {assist.possible?.length ? <ul>{assist.possible.map((item) => <li key={item.message}>Possible: {item.message}</li>)}</ul> : null}
          {assist.suggestion?.corrected ? (
            <div>
              <button type="button" className="code-action-btn" onClick={() => setShowFixed((value) => !value)}>Compare changes</button>
              {showFixed ? <pre className="code-assist-fix">{assist.suggestion.corrected}</pre> : null}
              <p>{assist.suggestion.explanation}</p>
            </div>
          ) : assist.suggestion?.explanation ? <p>{assist.suggestion.explanation}</p> : null}
        </div>
      ) : null}
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
