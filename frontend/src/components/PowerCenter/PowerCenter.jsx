import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import './PowerCenter.css';

const modules = [
  ['council','Council','Multi-model consensus','Ask several models and synthesize the strongest answer.','/arena'],
  ['keys','BYOK','Provider connections','Connect OpenAI, Anthropic, Gemini, or OpenRouter safely.','/settings'],
  ['documents','Documents','PDF & DOCX workspace','Import documents and ask grounded questions with sources.','/studio?tool=document'],
  ['knowledge','Semantic KB','Meaning-based retrieval','Search project knowledge and attach relevant context.','/studio?tool=document'],
  ['schedule','Automations','Scheduled AI tasks','Create repeatable background research and content jobs.','/expansion-hub'],
  ['artifacts','Artifacts','Live output preview','Build and preview web artifacts alongside AI.','/website-builder'],
  ['facts','Fact Check','Evidence review','Research claims, sources, and uncertainty.','/ai-tools?tool=research'],
  ['budget','Budget','Cost guardrails','Track usage and choose the best model within a limit.','/studio?tool=analytics'],
  ['market','Marketplace','Reusable assistants','Discover prompts, assistants, and community workflows.','/prompts'],
  ['evals','Prompt Tests','Regression evaluations','Compare prompt quality across models and versions.','/innovation-lab'],
];

export default function PowerCenter(){
  const navigate=useNavigate();
  const saved=sessionStorage.getItem('allmodelai_user');
  const user=saved?JSON.parse(saved):null;
  const [query,setQuery]=useState('');
  const [active,setActive]=useState('council');
  const visible=useMemo(()=>modules.filter(item=>`${item[1]} ${item[2]} ${item[3]}`.toLowerCase().includes(query.toLowerCase())),[query]);
  const current=modules.find(item=>item[0]===active)||modules[0];
  if(!user)return <Navigate to="/" replace/>;
  return <main className="power-center">
    <header><Link to="/dashboard"><b>AI</b>AllModelAI</Link><nav><Link to="/chat">Chat</Link><Link to="/studio">Studio</Link><Link to="/dashboard">Dashboard</Link></nav></header>
    <section className="power-hero"><small>ALLMODEL AI · POWER CENTER</small><h1>Ten serious tools.<br/><span>One connected workspace.</span></h1><p>Move from a prompt to a verified, budget-aware result without leaving AllModelAI.</p></section>
    <section className="power-layout"><aside><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tools…"/>{visible.map((item,index)=><button className={active===item[0]?'active':''} onClick={()=>setActive(item[0])} key={item[0]}><i>{String(index+1).padStart(2,'0')}</i><span><strong>{item[1]}</strong><small>{item[2]}</small></span></button>)}</aside>
      <article className="power-panel"><div className="power-number">{String(modules.findIndex(item=>item[0]===current[0])+1).padStart(2,'0')}</div><small>{current[2].toUpperCase()}</small><h2>{current[1]}</h2><p>{current[3]}</p><div className="power-flow"><span>Configure</span><b>→</b><span>Run with AI</span><b>→</b><span>Review & save</span></div><button onClick={()=>navigate(current[4])}>Open {current[1]} <b>→</b></button><footer><i/>Connected to your account, workspace, usage records, and Smart Router.</footer></article>
    </section>
  </main>;
}
