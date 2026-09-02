import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import '../NextTen/NextTen.css';
import './NextTwentyFive.css';

const features=[
 ['debate','AI Debate Mode','Models','Two models defend opposing positions while a third judge creates a balanced conclusion.','/arena','Debate this topic from two opposing positions. Let Model A argue in favor, Model B argue against, then act as an impartial judge and write a conclusion:\n\n'],
 ['planner','Prompt Planner','Prompts','Turn one goal into an efficient sequence of prompts, models, checks, and outputs.','/studio?tool=chains'],
 ['estimate','Preflight Cost Estimate','Analytics','Preview expected model cost, latency, context size, and quality before sending.','/studio?tool=models'],
 ['benchmark','Model Benchmark','Models','Run your own evaluation set and compare quality, speed, reliability, and price.','/innovation-lab?feature=evals'],
 ['consensus','Consensus Mode','Models','Ask several models independently and synthesize their strongest shared answer.','/arena','Answer this task independently from three expert perspectives, identify agreement, and synthesize a single consensus answer:\n\n'],
 ['conflicts','Contradiction Finder','Trust','Find claims where model answers disagree and explain what evidence can resolve them.','/chat?model=smart','Find every contradiction in the following answers. Group conflicting claims, explain the disagreement, and state what evidence would resolve it:\n\n'],
 ['context-router','Context-aware Router','Routing','Choose a provider using the task, project documents, history, preferences, and budget.','/studio?tool=router'],
 ['fallback','Fallback Chains','Routing','Continue through another provider after errors, limits, high latency, or price spikes.','/innovation-lab?feature=fallback'],
 ['agents','Agent Builder','Agents','Configure an agent’s model, instructions, memory, tools, limits, and response style.','/innovation-lab?feature=agents'],
 ['debugger','Agent Debugger','Agents','Inspect agent steps, tool calls, routing decisions, failures, and execution time.','/production'],
 ['rag','RAG Knowledge Base','Knowledge','Ground answers in PDFs, websites, notes, code, and project documents.','/innovation-lab?feature=rag'],
 ['citations','Document Citations','Knowledge','Show the exact source, page, and excerpt supporting every grounded answer.','/studio?tool=document'],
 ['sync','Knowledge Auto-sync','Knowledge','Keep connected websites and cloud documents synchronized with project knowledge.','/expansion-hub?feature=memory'],
 ['workspace','Team AI Workspace','Team','Share projects, chats, agents, documents, templates, and role-based access.','/studio?tool=team'],
 ['comments','Comments & Co-editing','Team','Review AI output together, add comments, and edit the final artifact collaboratively.','/control-center?feature=share'],
 ['approval','Human Approval Steps','Automation','Pause sensitive workflow actions until an authorized person approves them.','/expansion-hub?feature=workflow'],
 ['inbox','AI Task Inbox','Automation','Manage agent tasks with priorities, owners, deadlines, statuses, and results.','/studio?tool=tasks'],
 ['prompt-analytics','Prompt Analytics','Prompts','Measure prompt quality, cost, latency, usage, and success across projects.','/studio?tool=analytics'],
 ['optimizer','Prompt Optimizer','Prompts','Diagnose a weak request and produce a clearer, more reliable prompt.','/chat?model=smart','Improve the following prompt. Preserve its intent, add missing context and constraints, specify the expected output, and return the improved prompt plus a short explanation:\n\n'],
 ['ab','Prompt A/B Testing','Prompts','Compare prompt variants across models and score the strongest result.','/studio?tool=prompt'],
 ['local','Local Models','Privacy','Connect Ollama models for private, offline, and zero-cloud-cost work.','/expansion-hub?feature=local'],
 ['vault','Privacy Vault','Privacy','Protect selected documents, prompts, keys, and conversations before storage.','/control-center?feature=security'],
 ['pii','PII & Secret Cleaner','Privacy','Detect and redact emails, phones, addresses, API keys, and secrets before sending.','/chat?model=smart','Sanitize the following content before it is sent to an AI model. Replace personal information and secrets with clear placeholders. Return the sanitized version and a list of redaction categories; never repeat the sensitive values:\n\n'],
 ['browser','Browser Agent','Agents','Research pages and complete controlled multi-step browser tasks.','/ai-tools?tool=research'],
 ['market','Extension Marketplace','Community','Install and publish agents, workflows, prompts, tools, and knowledge packs.','/expansion-hub?feature=marketplace'],
];
const categories=['All',...new Set(features.map(item=>item[2]))];

export default function NextTwentyFive(){
 const saved=sessionStorage.getItem('allmodelai_user'),user=saved?JSON.parse(saved):null,navigate=useNavigate();
 const[active,setActive]=useState('debate'),[category,setCategory]=useState('All'),[query,setQuery]=useState(''),[input,setInput]=useState('');
 const visible=useMemo(()=>features.filter(item=>(category==='All'||item[2]===category)&&`${item[1]} ${item[2]} ${item[3]}`.toLowerCase().includes(query.toLowerCase())),[category,query]);
 const selected=features.find(item=>item[0]===active)||features[0];
 if(!user)return <Navigate to="/" replace/>;
 const launch=()=>{if(selected[5]){if(!input.trim())return;navigate('/chat?model=smart',{state:{starterPrompt:`${selected[5]}${input}`}});return;}navigate(selected[4]);};
 return <main className="next-ten-page next-25-page">
  <header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/next-9">Next 9</Link><Link to="/next-10">Next 10</Link><Link to="/dashboard">Dashboard</Link></nav></header>
  <section className="next-ten-hero"><div><p>ALLMODEL AI · 25 CAPABILITIES</p><h1>Build beyond chat.<br/><span>Orchestrate intelligence.</span></h1><small>Models, agents, knowledge, automation, collaboration, analytics, prompts, and privacy in one connected product.</small></div><strong>25</strong></section>
  <section className="next-25-toolbar"><label><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a capability..."/></label><div>{categories.map(item=><button className={category===item?'active':''} onClick={()=>setCategory(item)} key={item}>{item}</button>)}</div></section>
  <section className="next-ten-shell next-25-shell"><aside>{visible.map((item,index)=><button type="button" className={active===item[0]?'active':''} onClick={()=>{setActive(item[0]);setInput('');}} key={item[0]}><i>{String(features.indexOf(item)+1).padStart(2,'0')}</i><span>{index%3===0?'✦':index%3===1?'◇':'⌁'}</span><div><strong>{item[1]}</strong><small>{item[2]}</small></div></button>)}</aside>
   <article className="next-ten-panel"><div className="next-ten-panel-title"><span>{String(features.findIndex(item=>item[0]===selected[0])+1).padStart(2,'0')}</span><div><small>{selected[2].toUpperCase()} MODULE</small><h2>{selected[1]}</h2></div></div><p className="next-ten-description">{selected[3]}</p>
    {selected[5]?<div className="agent-team"><label>Task or content<textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Add the topic, prompt, answers, or content here..."/></label></div>:<div className="next-ten-flow"><div><i>1</i><span>Configure</span></div><b>→</b><div><i>2</i><span>Run with AI</span></div><b>→</b><div><i>3</i><span>Review & save</span></div></div>}
    <button className="next-ten-launch" type="button" disabled={Boolean(selected[5])&&!input.trim()} onClick={launch}>Open {selected[1]} <span>→</span></button><footer><span>● Module ready</span><small>Connected to your AllModelAI account, models, projects, and usage controls.</small></footer>
   </article>
  </section>
 </main>;
}
