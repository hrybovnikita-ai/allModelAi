import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import '../NextTen/NextTen.css';
import '../NextTwentyFive/NextTwentyFive.css';

const prompt = (role, output) => `Act as ${role}. Use supported facts, mark uncertainty, and produce ${output}.\n\nUSER INPUT:\n`;

const features = [
  ['parallel', 'Parallel AI Chat', 'Models', 'Send one prompt to several models and compare their answers side by side.', '/arena'],
  ['judge', 'AI Answer Judge', 'Models', 'Evaluate responses for accuracy, clarity, speed, usefulness, and cost.', null, prompt('an impartial AI response evaluator', 'a scored comparison, evidence for every score, and a clear winner')],
  ['merge', 'Response Merger', 'Models', 'Combine the strongest parts of several model responses into one final answer.', null, prompt('a senior synthesis editor', 'one accurate final answer and a note explaining which ideas were retained')],
  ['fact-check', 'Fact-Checking Mode', 'Research', 'Check important claims, flag uncertainty, and request supporting sources.', null, prompt('a rigorous fact-checker', 'a claim-by-claim verdict, corrections, confidence levels, and sources to verify')],
  ['web-research', 'Live Web Research', 'Research', 'Run guided research and produce an organized report with citations.', '/expansion-hub?feature=research'],
  ['model-quiz', 'Model Recommendation Quiz', 'Models', 'Describe your goal and receive a model recommendation that explains the tradeoffs.', null, prompt('an AI model selection consultant', 'the best primary model, two alternatives, tradeoffs, and a recommended configuration')],
  ['switching', 'Automatic Model Switching', 'Models', 'Use Smart Router to select the best model whenever the task changes.', '/chat?model=smart'],
  ['optimizer', 'Prompt Optimizer', 'Prompts', 'Transform a rough request into a precise, structured, reusable prompt.', null, prompt('an expert prompt engineer', 'an improved prompt with role, context, constraints, output format, and success criteria')],
  ['debugger', 'Prompt Debugger', 'Prompts', 'Understand why a prompt failed and receive a corrected version.', null, prompt('a prompt-debugging specialist', 'failure causes, an ambiguity report, missing context, and a corrected prompt')],
  ['variables', 'Prompt Variables', 'Prompts', 'Create reusable templates with variables such as {product}, {audience}, and {tone}.', '/expansion-hub?feature=versions'],
  ['branches', 'Branching Conversations', 'Workspace', 'Explore several directions from one message without losing the original conversation.', '/chat?model=smart'],
  ['folders', 'Chat Folders & Tags', 'Workspace', 'Organize saved conversations by client, topic, project, and custom labels.', '/studio?tool=history'],
  ['search', 'Universal Search', 'Workspace', 'Search chats, documents, prompts, agents, projects, and generated files.', '/production'],
  ['summaries', 'Automatic Chat Summaries', 'Workspace', 'Turn long conversations into concise summaries, decisions, and action items.', null, prompt('an executive conversation analyst', 'a concise summary, decisions, open questions, and action items')],
  ['memory', 'Permanent User Memory', 'Workspace', 'Save preferences, writing style, profession, and recurring instructions.', '/expansion-hub?feature=memory'],
  ['projects', 'Project Workspaces', 'Workspace', 'Keep chats, documents, instructions, agents, and collaborators together.', '/studio'],
  ['marketplace', 'AI Agent Marketplace', 'Agents', 'Discover, install, share, and rate specialized agents and templates.', '/expansion-hub?feature=marketplace'],
  ['teams', 'Agent Teams', 'Agents', 'Coordinate researcher, writer, reviewer, and fact-checker agents on one goal.', null, prompt('an AI agent-team coordinator', 'role assignments, execution order, handoff rules, review gates, and a final deliverable plan')],
  ['scheduled', 'Scheduled Agents', 'Agents', 'Define repeatable AI reports and tasks that are ready to run on a schedule.', '/expansion-hub?feature=workflow'],
  ['approval', 'Human Approval Steps', 'Agents', 'Add review checkpoints before an automated workflow continues.', '/expansion-hub?feature=workflow'],
  ['document-compare', 'Document Comparison', 'Files', 'Compare two documents and highlight wording, meaning, and risk changes.', null, prompt('a meticulous document comparison specialist', 'a section-by-section change report, additions, removals, meaning changes, and risk flags')],
  ['ocr', 'OCR Document Scanner', 'Files', 'Extract, clean, and analyze text from screenshots, scans, and photographs.', '/creator-tools'],
  ['media', 'Audio & Video Analysis', 'Files', 'Create transcripts, summaries, chapters, highlights, and action items.', null, prompt('an audio and video content analyst', 'a structured analysis, summary, chapters, key moments, and action items')],
  ['images', 'Image Generation Studio', 'Create', 'Generate, edit, upscale, and remove backgrounds from images.', '/creator-tools'],
  ['sandbox', 'Code Sandbox', 'Build', 'Generate code, test its logic, explain the output, and prepare verification steps.', null, prompt('a senior software engineer working in a safe code sandbox', 'runnable code, setup instructions, expected output, tests, and security notes')],
  ['website', 'Website Preview Sandbox', 'Build', 'Generate HTML, CSS, and JavaScript with an immediate live preview.', '/website-builder'],
  ['cost', 'Token & Cost Calculator', 'Analytics', 'Estimate request cost before running and understand actual usage afterward.', '/production'],
  ['performance', 'Model Performance Dashboard', 'Analytics', 'Compare model response time, availability, quality, usage, and cost.', '/control-center'],
  ['extension', 'Browser Extension', 'Everywhere', 'Prepare webpage summarizing, translating, explaining, and rewriting workflows.', null, prompt('a browser-extension product architect', 'a feature specification, user flow, permissions, privacy safeguards, architecture, and milestones')],
  ['offline', 'Mobile / PWA Offline Mode', 'Everywhere', 'Install AllModelAI as an app and keep essential workspace data available offline.', '/settings'],
];

const categories = ['All', ...new Set(features.map((feature) => feature[2]))];

export default function NextThirty() {
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const navigate = useNavigate();
  const [active, setActive] = useState(features[0][0]);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const visible = useMemo(() => features.filter((feature) => (category === 'All' || feature[2] === category) && `${feature[1]} ${feature[2]} ${feature[3]}`.toLowerCase().includes(query.toLowerCase())), [category, query]);
  const selected = features.find((feature) => feature[0] === active) || features[0];
  if (!user) return <Navigate to="/" replace />;
  const launch = () => {
    if (selected[5]) {
      if (!input.trim()) return;
      navigate('/chat?model=smart', { state: { starterPrompt: `${selected[5]}${input}` } });
    } else navigate(selected[4]);
  };
  return <main className="next-ten-page next-25-page">
    <header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/arena">AI Arena</Link><Link to="/studio">Projects</Link><Link to="/dashboard">Dashboard</Link></nav></header>
    <section className="next-ten-hero"><div><p>ALLMODEL AI · 30 NEW FEATURES</p><h1>One workspace.<br/><span>Thirty new powers.</span></h1><small>Compare, verify, organize, automate, create, and measure your AI work from one connected feature hub.</small></div><strong>30</strong></section>
    <section className="next-25-toolbar"><label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 30 features..." aria-label="Search features" /></label><div>{categories.map((value) => <button type="button" className={category === value ? 'active' : ''} onClick={() => setCategory(value)} key={value}>{value}</button>)}</div></section>
    <section className="next-ten-shell next-25-shell"><aside>{visible.map((feature) => <button type="button" className={active === feature[0] ? 'active' : ''} onClick={() => { setActive(feature[0]); setInput(''); }} key={feature[0]}><i>{String(features.indexOf(feature) + 1).padStart(2, '0')}</i><span>✦</span><div><strong>{feature[1]}</strong><small>{feature[2]}</small></div></button>)}</aside>
      <article className="next-ten-panel"><div className="next-ten-panel-title"><span>{String(features.findIndex((feature) => feature[0] === selected[0]) + 1).padStart(2, '0')}</span><div><small>{selected[2].toUpperCase()} FEATURE</small><h2>{selected[1]}</h2></div></div><p className="next-ten-description">{selected[3]}</p>
        {selected[5] ? <div className="agent-team"><label>What should this feature work on?<textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste content or describe your goal..." /></label></div> : <div className="next-ten-flow"><div><i>1</i><span>Open module</span></div><b>→</b><div><i>2</i><span>Add your context</span></div><b>→</b><div><i>3</i><span>Create & save</span></div></div>}
        <button className="next-ten-launch" type="button" disabled={Boolean(selected[5]) && !input.trim()} onClick={launch}>{selected[5] ? `Run ${selected[1]}` : `Open ${selected[1]}`} <span>→</span></button><footer><span>● Feature ready</span><small>Connected to Smart Router, models, projects, memory, and usage controls.</small></footer>
      </article>
    </section>
  </main>;
}
