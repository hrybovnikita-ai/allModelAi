import { useState } from 'react';
import ChatCodeBlock from '../Chat/ChatCodeBlock';

export default function ModelDetailCodePanel({ modelName, codeJs, codePy }) {
  const [tab, setTab] = useState('javascript');
  const hasJs = Boolean(codeJs?.trim());
  const hasPy = Boolean(codePy?.trim());

  if (!hasJs && !hasPy) return null;

  const activeCode = tab === 'python' ? codePy : codeJs;
  const language = tab === 'python' ? 'python' : 'javascript';
  const filename = tab === 'python' ? 'allmodelai_chat.py' : 'allmodelai_chat.js';

  return (
    <section className="model-detail-section" id="model-code" aria-labelledby="model-code-title">
      <header className="model-detail-section__head">
        <div>
          <p className="dashboard-eyebrow">API examples</p>
          <h2 id="model-code-title">Use {modelName} in your code</h2>
        </div>
        <p>
          Send requests through the unified AllModelAI API. Replace placeholders with your session or server-side credentials — never expose private keys in the browser.
        </p>
      </header>

      {(hasJs && hasPy) && (
        <div className="model-detail-code-tabs" role="tablist" aria-label="Code language">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'javascript'}
            className={tab === 'javascript' ? 'is-active' : ''}
            onClick={() => setTab('javascript')}
          >
            JavaScript
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'python'}
            className={tab === 'python' ? 'is-active' : ''}
            onClick={() => setTab('python')}
          >
            Python
          </button>
        </div>
      )}

      <div className="model-detail-code-block">
        <ChatCodeBlock language={language} code={activeCode} filename={filename} />
      </div>
    </section>
  );
}
