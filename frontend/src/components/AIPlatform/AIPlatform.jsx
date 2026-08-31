import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import './AIPlatform.css';

const modules = [
  ['agent','AI Agent Builder','Create agents with identity, instructions, tools, model, and memory.','/studio?tool=assistant','Create agent',['Choose a model','Write instructions','Attach knowledge and memory']],
  ['code','AI Code Studio','Create, edit, debug, explain, and run frontend code.','/website-builder','Open Code Studio',['Generate files','Edit source','Run in a sandbox']],
  ['debate','AI Debate Mode','Let several models challenge the same question and compare conclusions.','/arena','Start debate',['Ask one question','Compare arguments','Select a conclusion']],
  ['judge','AI Judge','Compare responses for accuracy, reasoning, creativity, and usefulness.','/arena','Open AI Judge',['Run blind answers','Review evidence','Vote for the winner']],
  ['router','Smart Model Router 2.0','Detect the task and select the strongest available model automatically.','/chat?model=smart','Use Smart Router',['Classify the task','Check providers','Route with fallback']],
  ['website','AI Website Builder','Generate complete websites from a plain-language description.','/website-builder','Build website',['Describe the website','Generate three files','Refine the result']],
  ['preview','Live Code Preview','Edit HTML, CSS, and JavaScript beside the rendered interface.','/website-builder','Open Live Preview',['Edit source','Preview instantly','Test responsive sizes']],
  ['knowledge','AI Knowledge Base','Upload documents and ground AI answers in your own material.','/studio?tool=document','Open Knowledge Base',['Import files','Index content','Ask grounded questions']],
  ['memory','Project Memory','Keep requirements, decisions, files, and conversations per project.','/studio?tool=project','Manage memory',['Create a project','Save context','Reuse decisions']],
  ['integrations','Integrations Hub','Prepare connections for GitHub, Drive, Gmail, Notion, Slack, and Discord.','/innovation-hub','Manage integrations',['Choose a service','Configure access','Connect a workflow']],
  ['team','Multi-Agent Team','Coordinate Planner, Designer, Developer, Tester, and Reviewer agents.','/studio?tool=chains','Build agent team',['Define specialist roles','Run sequential work','Review final output']],
  ['workflow','AI Workflow Builder','Connect prompts, models, search, code agents, and reviewers.','/studio?tool=chains','Build workflow',['Add steps','Configure models','Run the chain']],
  ['research','Deep Research Mode','Collect sources, compare findings, and create cited reports.','/ai-tools?tool=research','Start research',['Search the web','Compare sources','Synthesize with citations']],
  ['verify','AI Answer Verifier','Check facts, mistakes, hallucinations, and unsupported claims.','/ai-tools?tool=quality','Verify answer',['Paste an answer','Score evidence','Generate improvements']],
  ['benchmark','Model Benchmark Center','Compare model capability, speed, context, availability, and cost.','/explore','Open benchmarks',['Filter models','Inspect strengths','Run Arena tests']],
  ['usage','Usage & Cost Dashboard','Track requests, model use, response counts, and estimated spend.','/studio?tool=analytics','View usage',['Monitor requests','Compare models','Control budget']],
  ['creative','AI Creative Studio','Create images and plan video, music, sound, and voice projects.','/creator-tools','Open Creative Studio',['Choose a medium','Generate content','Save variations']],
  ['artifact','AI Artifact Builder','Create websites, documents, decks, diagrams, reports, and charts.','/creator-tools','Create artifact',['Choose a format','Generate structure','Export the result']],
  ['skills','AI Skills Marketplace','Install reusable experts for development, design, SEO, data, and content.','/studio?tool=assistant','Browse skills',['Choose a skill','Customize instructions','Launch the expert']],
  ['automation','AI Automations','Schedule recurring research, reviews, summaries, and reports.','/innovation-hub','Create automation',['Describe a task','Choose frequency','Save the schedule']],
  ['voice','Voice Conversation','Speak naturally with AI and hear answers without typing every message.','/chat?feature=voice','Start voice chat',['Allow microphone access','Ask your question','Listen or read the answer']],
  ['screen','Screen Understanding','Upload screenshots so AI can explain interfaces, errors, and visible content.','/chat?feature=vision','Analyze a screen',['Attach a screenshot','Describe the problem','Review the visual analysis']],
  ['bugfix','Automatic Bug Fixer','Find coding problems, explain the cause, and produce corrected source files.','/website-builder','Fix code',['Open project code','Detect errors','Apply and preview fixes']],
  ['prompt','Prompt Improver','Turn short requests into clear, detailed prompts that produce stronger answers.','/chat?feature=prompt','Improve a prompt',['Write a rough request','Add useful context','Send the improved prompt']],
  ['tutor','Personal AI Tutor','Learn step by step with explanations, exercises, answer checking, and progress.','/chat?feature=tutor','Open AI Tutor',['Choose a topic','Learn interactively','Practice and review']],
  ['branches','Conversation Branches','Explore a new direction from any response while preserving the original chat.','/chat?feature=branches','Open conversations',['Choose a response','Create a branch','Continue independently']],
  ['planner','AI Task Planner','Convert an idea into prioritized tasks, deadlines, and a progress checklist.','/studio?tool=project','Plan a project',['Describe the goal','Generate milestones','Track completion']],
  ['styles','Response Styles','Switch between concise, professional, creative, teacher, developer, and reasoning modes.','/chat?feature=styles','Choose a style',['Select a response mode','Ask your question','Change style anytime']],
  ['variables','Reusable Prompt Variables','Build templates with reusable values such as language, project name, and audience.','/studio?tool=assistant','Create a template',['Write a prompt template','Insert variables','Reuse it across projects']],
  ['actions','AI Response Actions','Simplify, expand, translate, verify, improve, or convert any answer into code.','/chat?feature=actions','Try response actions',['Generate an answer','Choose an action','Save the improved result']],
  ['provider-router','Smart Provider Router','Route simple requests to efficient providers and complex work to premium models using availability, latency, and quality signals.','/chat?model=smart','Start smart routing',['Analyze query complexity','Balance speed, quality, and cost','Track provider performance']],
  ['usage-analytics','Usage Analytics Dashboard','Inspect provider costs, token trends, conversation usage, budget limits, and exportable billing reports.','/studio?tool=analytics','Open usage analytics',['Compare provider usage','Monitor trends and budgets','Export a usage report']],
  ['prompt-versioning','Prompt Library & Versioning','Create, version, tag, rate, share, and compare reusable prompt templates across projects.','/chat?feature=prompts','Open prompt library',['Create and tag a prompt','Save versions and share','Run an A/B comparison']],
  ['multi-workflows','Multi-Step AI Workflows','Chain providers with visual steps, conditional branches, reusable templates, and total cost and latency tracking.','/studio?tool=chains','Build a workflow',['Connect provider steps','Add conditions and fallbacks','Measure the complete run']],
];

export default function AIPlatform() {
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const navigate = useNavigate();
  const [active, setActive] = useState('agent');
  const [query, setQuery] = useState('');
  if (!user) return <Navigate to="/" replace />;
  const selected = modules.find(([key]) => key === active) || modules[0];
  const visible = modules.filter((module) => `${module[1]} ${module[2]}`.toLowerCase().includes(query.toLowerCase()));

  return <main className="ai-platform-page">
    <header className="platform-header"><Link to="/dashboard" className="platform-brand"><span>AI</span>AllModelAI</Link><nav><Link to="/chat">Chat</Link><Link to="/website-builder">Website Builder</Link><Link to="/dashboard">Dashboard</Link></nav></header>
    <section className="platform-heading"><div><p>ALLMODEL AI PLATFORM</p><h1>{modules.length} connected AI workspaces.</h1><span>Build, research, compare, verify, automate, learn, and create without leaving your project.</span></div><strong>{modules.length}</strong></section>
    <div className="platform-shell">
      <aside><label><span>Search modules</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools..." /></label><div>{visible.map(([key,name,description])=><button type="button" className={active===key?'active':''} onClick={()=>setActive(key)} key={key}><i>{String(modules.findIndex(([item])=>item===key)+1).padStart(2,'0')}</i><span><strong>{name}</strong><small>{description}</small></span></button>)}</div></aside>
      <section className="platform-panel"><small>MODULE {String(modules.findIndex(([key])=>key===selected[0])+1).padStart(2,'0')}</small><h2>{selected[1]}</h2><p>{selected[2]}</p><div className="platform-flow">{selected[5].map((step,index)=><div key={step}><i>{index+1}</i><span>{step}</span></div>)}</div><button type="button" className="platform-launch" onClick={()=>navigate(selected[3])}>{selected[4]} <span>→</span></button><footer><b>Connected to AllModelAI</b><span>Authentication, saved workspaces, and model fallback remain active.</span></footer></section>
    </div>
  </main>;
}
