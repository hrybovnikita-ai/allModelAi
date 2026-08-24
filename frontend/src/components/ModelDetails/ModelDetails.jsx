import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { dashboardModels } from '../../data/dashboardModels';
import './ModelDetails.css';
import './ModelCode.css';

const versionNames = {
  'claude-opus-4.1': 'Claude Opus',
  'claude-sonnet-4.6': 'Claude Sonnet',
  'claude-haiku-4.5': 'Claude Haiku',
};

const guideTopics = [
  'Reasoning', 'Writing', 'Coding', 'Research', 'Planning',
  'Analysis', 'Summaries', 'Creative work', 'Team workflows', 'Reliable output',
];

export default function ModelDetails() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const savedUser = sessionStorage.getItem('allmodelai_user');
  const model = dashboardModels.find((item) => item.slug === slug);
  const [copied, setCopied] = useState('');

  if (!savedUser) return <Navigate to="/" replace />;
  if (!model) return <Navigate to="/dashboard" replace />;

  const selectedVersion = versionNames[searchParams.get('version')];
  const versionLabel = selectedVersion || model.name;
  const guideParagraphs = Array.from({ length: 100 }, (_, index) => {
    const topic = guideTopics[index % guideTopics.length];
    return `${versionLabel} supports ${topic.toLowerCase()} through a focused workflow. Start with the goal, provide the useful context, and ask for an answer in the format your project needs. This page is a practical guide for using ${model.name} in AllModelAI.`;
  });

  const copyCode = async (language, code) => {
    await navigator.clipboard.writeText(code);
    setCopied(language);
    window.setTimeout(() => setCopied(''), 1600);
  };

  return (
    <main className="model-page">
      <nav className="model-page-nav"><Link to="/dashboard">← Back to models</Link><Link to="/" className="model-page-brand"><span>AI</span>AllModelAI</Link></nav>
      <section className="model-page-hero">
        <div className="model-page-copy"><p className="model-page-label">{model.provider} model</p><h1>{versionLabel}</h1><p>{model.description}</p><div className="model-page-actions"><Link to={`/chat?model=${model.slug}`}>Start with {model.name}</Link><a href="#model-code">View code example</a><a href="#model-guide">Read guide</a></div></div>
        <div className="model-page-image"><div><img src={model.image} alt={`${model.name} by ${model.provider}`} /></div><span>{model.provider}</span><strong>{model.name}</strong></div>
      </section>
      <section className="model-control-bar" aria-label="Model actions">
        <div><span className="model-page-label">Selected version</span><strong>{versionLabel}</strong></div>
        <div className="model-control-actions"><Link to={`/chat?model=${model.slug}`}>Open chat</Link><a href={`https://www.google.com/search?q=${encodeURIComponent(`${model.provider} ${model.name} documentation`)}`} target="_blank" rel="noreferrer">Provider docs</a><a href="#model-guide">Explore capabilities</a></div>
      </section>
      <section className="model-page-info">
        <div><p className="model-page-label">Why choose {model.name}</p><h2>Built for ambitious work.</h2></div>
        <div className="model-strengths">{model.strengths.map((strength,index)=><article key={strength}><span>0{index+1}</span><h3>{strength}</h3><p>Use {model.name} when your project needs {strength.toLowerCase()} with a simple unified API.</p></article>)}</div>
      </section>
      <section className="model-code model-code-dual" id="model-code">
        <div className="model-code-intro"><p className="model-page-label">Quick start</p><h2>Use {model.name} in your code.</h2><p>Choose JavaScript or Python. Both examples send the same request through the unified AllModelAI API.</p></div>
        <div className="code-examples">
          <article><header><span><b>JS</b> JavaScript</span><button onClick={() => copyCode('js', model.codeJs)}>{copied === 'js' ? 'Copied!' : 'Copy code'}</button></header><pre><code>{model.codeJs}</code></pre></article>
          <article><header><span><b>PY</b> Python</span><button onClick={() => copyCode('py', model.codePy)}>{copied === 'py' ? 'Copied!' : 'Copy code'}</button></header><pre><code>{model.codePy}</code></pre></article>
        </div>
      </section>
      <section className="model-guide" id="model-guide">
        <div className="model-guide-header"><div><p className="model-page-label">Model guide</p><h2>Build better work with {versionLabel}.</h2></div><p>Explore practical patterns for prompts, research, code, writing, and everyday collaboration.</p></div>
        <div className="model-guide-layout">
          <aside className="model-guide-aside"><div className="guide-preview"><img src={model.image} alt="" /><strong>{versionLabel}</strong><span>{model.provider}</span></div><a href="#model-code">API examples</a><a href="#model-strengths">Capabilities</a><a href={`/chat?model=${model.slug}`}>Try in chat</a></aside>
          <article className="model-guide-copy">{guideParagraphs.map((paragraph, index) => <p key={`${model.slug}-guide-${index}`}>{paragraph}</p>)}</article>
        </div>
      </section>
    </main>
  );
}
