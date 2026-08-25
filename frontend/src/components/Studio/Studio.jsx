import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import './Studio.css';
import './StudioFeatures.css';

const features = [
  ['router','Smart Router','Best model for every task'], ['arena','AI Arena','Compare answers side by side'],
  ['chains','AI Chains','Several models, one workflow'], ['prompt','Prompt Library','Reusable prompt templates'],
  ['project','Projects & History','Organize long-running work'], ['models','Model Comparison','Capabilities, price, and speed'],
  ['analytics','Cost Analytics','Tokens, models, and spend'], ['document','Files & Documents','Ask questions about your files'],
  ['assistant','AI Assistants','Build a personal expert'], ['voice','Voice Mode','Speak and listen naturally'],
  ['news','Model Updates','Discover new model releases'], ['memory','Memory','Personal context you control'],
  ['sources','Research','Answers designed for citations'],
];
const modelRows = [
  ['Claude','Anthropic','200K','Deep reasoning','$$','Thoughtful'], ['Gemini','Google','1M','Multimodal','$','Very fast'],
  ['GPT','OpenAI','128K','General purpose','$$','Fast'], ['Llama','Meta','128K','Open source','$','Fast'],
];
const updates = [
  ['New reasoning models','Stronger planning, coding, and long-form analysis are now available through Smart Router.','NEW'],
  ['Faster Gemini routing','Multimodal requests can be routed to Gemini automatically when speed matters.','ROUTER'],
  ['Expanded open-model library','Llama, DeepSeek, Mistral, Qwen, and more are available from one workspace.','MODELS'],
];
const promptTemplates = [
  ['Code review','Review this code for bugs, security risks, and improvements:\n\n'], ['Study coach','Teach me this topic, then test me with five questions:\n\n'],
  ['Content plan','Create a practical 30-day content plan for:\n\n'], ['Business analyst','Analyze this idea, risks, audience, and next steps:\n\n'],
  ['Rewrite','Rewrite this clearly while preserving the original meaning:\n\n'], ['Research brief','Research this topic with current reliable sources and citations:\n\n'],
];

async function askTeamModel(model, prompt, email) {
  const response = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model, messages:[{role:'user',text:prompt}], userEmail:email, temporary:true, routerMode:'economy' }) });
  if (!response.ok) { const data=await response.json().catch(()=>({})); throw new Error(data.message||`${model} is unavailable`); }
  const reader=response.body.getReader(); const decoder=new TextDecoder(); let buffer=''; let answer='';
  while (true) { const {done,value}=await reader.read(); buffer+=decoder.decode(value||new Uint8Array(),{stream:!done}); const events=buffer.replaceAll('\r\n','\n').split('\n\n'); buffer=events.pop()||''; for(const event of events){const line=event.split('\n').find(row=>row.startsWith('data: '));if(!line||line.slice(6)==='[DONE]')continue;const data=JSON.parse(line.slice(6));if(data.text)answer+=data.text;} if(done)break; }
  return answer;
}

export default function Studio() {
  const navigate = useNavigate();
  const saved = sessionStorage.getItem('allmodelai_user');
  const user = saved ? JSON.parse(saved) : null;
  const [active, setActive] = useState('router');
  const [items, setItems] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [form, setForm] = useState({ name:'', content:'', instructions:'' });
  const [routerMode, setRouterMode] = useState(localStorage.getItem('allmodelai_router_mode') || 'balanced');
  const [chainTask, setChainTask] = useState('');
  const [teamResult,setTeamResult]=useState([]);
  const [teamRunning,setTeamRunning]=useState(false);
  const dataType = ['memory','project','document','prompt','assistant'].includes(active) ? active : null;
  const title = useMemo(() => features.find(([key]) => key === active)?.[1], [active]);

  useEffect(() => {
    if (!user?.email) return;
    if (dataType) fetch(`/api/workspace?email=${encodeURIComponent(user.email)}&type=${dataType}`).then(r => r.json()).then(setItems).catch(() => setItems([]));
    if (active === 'analytics') fetch(`/api/analytics?email=${encodeURIComponent(user.email)}`).then(r => r.json()).then(setAnalytics).catch(() => setAnalytics(null));
  }, [active, dataType, user?.email]);
  if (!user) return <Navigate to="/" replace />;

  const openChat = (prompt, model = 'smart') => navigate(`/chat?model=${model}`, { state:{ starterPrompt:prompt, routerMode } });
  const addItem = async (event) => { event.preventDefault(); if (!form.name.trim()) return; const response = await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,type:dataType,...form})}); if(response.ok){const created=await response.json();setItems(current=>[created,...current]);} setForm({name:'',content:'',instructions:''}); };
  const removeItem = async (item) => { const response=await fetch(`/api/workspace/${item.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email})}); if(response.ok)setItems(current=>current.filter(entry=>entry.id!==item.id)); };
  const importDocument = async (event) => { const file=event.target.files?.[0]; if(!file)return; const supported=/\.(txt|md|csv|json|js|jsx|ts|tsx|py|html|css)$/i.test(file.name); if(!supported){setForm({...form,name:file.name,content:'Paste extracted text here. Direct PDF/DOCX extraction will be added on the server.'});return;} const content=(await file.text()).slice(0,50000);setForm({...form,name:file.name,content}); };
  const runChain = async () => { if(!chainTask.trim()||teamRunning)return; setTeamRunning(true);setTeamResult([]);try{const draft=await askTeamModel('deepseek',`Create a strong first draft. Answer in the task language:\n\n${chainTask}`,user.email);setTeamResult([{model:'DeepSeek',role:'Draft',text:draft}]);const review=await askTeamModel('gemini',`Critically review this draft and give concrete corrections.\n\nTASK:\n${chainTask}\n\nDRAFT:\n${draft}`,user.email);setTeamResult(current=>[...current,{model:'Gemini',role:'Review',text:review}]);const final=await askTeamModel('llama',`Create the final polished answer using the draft and review. Return only the final result in the task language.\n\nTASK:\n${chainTask}\n\nDRAFT:\n${draft}\n\nREVIEW:\n${review}`,user.email);setTeamResult(current=>[...current,{model:'Llama',role:'Final',text:final}]);}catch(error){setTeamResult(current=>[...current,{model:'System',role:'Stopped',text:error.message}]);}finally{setTeamRunning(false);} };

  return <main className="studio-page"><header className="studio-header"><Link to="/dashboard" className="studio-brand"><span>AI</span>AllModelAI</Link><div><Link to="/chat">Open chat</Link><Link to="/dashboard">Dashboard</Link></div></header>
    <section className="studio-hero"><p>ALLMODEL WORKSPACE</p><h1>Everything AI. One workspace.</h1><span>Route, compare, automate, speak, and build with the world's leading models.</span></section>
    <div className="studio-layout"><nav className="studio-nav">{features.map(([key,label,description])=><button className={active===key?'active':''} onClick={()=>setActive(key)} key={key}><strong>{label}</strong><small>{description}</small></button>)}</nav>
      <section className="studio-panel"><div className="studio-title"><p>WORKSPACE MODULE</p><h2>{title}</h2></div>
        {active==='router'&&<div><p className="studio-copy">Smart Router analyzes your task and chooses the best model automatically.</p><div className="mode-grid">{[['quality','Maximum quality'],['balanced','Balanced'],['economy','Save credits'],['speed','Fastest answer']].map(([key,label])=><button className={routerMode===key?'selected':''} onClick={()=>{setRouterMode(key);localStorage.setItem('allmodelai_router_mode',key)}} key={key}><strong>{label}</strong><small>{key==='quality'?'Best reasoning model':key==='economy'?'Lowest-cost capable model':key==='speed'?'Lowest latency':'Quality and cost together'}</small></button>)}</div><button className="primary-action" onClick={()=>openChat('Help me with: ')}>Start Smart Chat</button></div>}
        {active==='arena'&&<div className="feature-showcase"><span>⚔</span><h3>One prompt. Multiple minds.</h3><p>Run GPT, Claude, and Gemini in parallel, compare their answers, and choose a winner.</p><button className="primary-action" onClick={()=>navigate('/arena')}>Open AI Arena</button></div>}
        {active==='chains'&&<div className="chain-builder"><p className="studio-copy">Budget team: one free-tier and two economical models create, check, and polish one result.</p><div className="chain-flow"><article><b>1</b><strong>DeepSeek</strong><small>Draft · ECONOMY</small></article><i>→</i><article><b>2</b><strong>Gemini</strong><small>Review · FREE TIER</small></article><i>→</i><article><b>3</b><strong>Llama</strong><small>Final · ECONOMY</small></article></div><textarea value={chainTask} onChange={e=>setChainTask(e.target.value)} placeholder="Describe the task for your AI team…"/><button className="primary-action" disabled={!chainTask.trim()||teamRunning} onClick={runChain}>{teamRunning?'AI team is working…':'Run budget AI team'}</button><div className="item-list">{teamResult.map((stage,index)=><article key={`${stage.model}-${index}`}><div><strong>{index+1}. {stage.role} — {stage.model}</strong><p>{stage.text}</p></div>{stage.text&&<span><button onClick={()=>navigator.clipboard.writeText(stage.text)}>Copy</button></span>}</article>)}</div></div>}
        {dataType&&<><form className="studio-form" onSubmit={addItem}>{active==='document'&&<label className="document-import">Import a text or code file<input type="file" accept=".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.pdf,.docx" onChange={importDocument}/></label>}<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder={active==='assistant'?'Assistant name':active==='prompt'?'Prompt title':active==='memory'?'What should AI remember?':`${title} name`}/>{active!=='memory'&&<textarea value={form.content} onChange={e=>setForm({...form,content:e.target.value})} placeholder={active==='assistant'?'Example: You are a senior product designer…':active==='document'?'Import a file or paste document text here':active==='prompt'?'Prompt text; use {{topic}} for variables':'Project description and knowledge'}/>} {(active==='project'||active==='assistant')&&<input value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} placeholder={active==='assistant'?'Special rules and preferred response style':'Project instructions for AI'}/>}<button>Add {active}</button></form>{active==='prompt'&&!items.length&&<div className="template-grid">{promptTemplates.map(([name,prompt])=><button onClick={()=>openChat(prompt)} key={name}><strong>{name}</strong><small>Use template →</small></button>)}</div>}<div className="item-list">{items.map(item=><article key={item.id}><div><strong>{item.name}</strong>{item.content&&<p>{item.content.slice(0,220)}</p>}{item.instructions&&<small>{item.instructions}</small>}</div><span>{active==='prompt'&&<button onClick={()=>openChat(item.content)}>Use</button>}{active==='document'&&<button onClick={()=>openChat(`Use this document as context:\n\n[${item.name}]\n${item.content}\n\nQuestion: `,'smart')}>Ask</button>}{active==='assistant'&&<button onClick={()=>openChat(`${item.content}\n\nAdditional rules: ${item.instructions}\n\nStart by introducing yourself briefly.`)}>Launch</button>}<button className="danger" onClick={()=>removeItem(item)}>Delete</button></span></article>)}</div></>}
        {active==='models'&&<div className="comparison-table"><div className="comparison-row heading"><span>Model</span><span>Context</span><span>Best for</span><span>Cost</span><span>Speed</span></div>{modelRows.map(row=><div className="comparison-row" key={row[0]}>{row.map(cell=><span key={cell}>{cell}</span>)}</div>)}<button className="primary-action" onClick={()=>navigate('/explore')}>Explore all models</button></div>}
        {active==='analytics'&&<div className="analytics-grid">{analytics?<><article><small>CONVERSATIONS</small><strong>{analytics.conversations}</strong></article><article><small>MESSAGES</small><strong>{analytics.messages}</strong></article><article><small>EST. TOKENS</small><strong>{analytics.estimatedTokens.toLocaleString()}</strong></article><article><small>EST. COST</small><strong>${analytics.estimatedCost?.toFixed(4)||'0.0000'}</strong></article><article><small>FREE-TIER CHATS</small><strong>{analytics.freeConversations||0}</strong></article><article><small>EST. SAVED</small><strong>${analytics.estimatedSavings?.toFixed(4)||'0.0000'}</strong></article><article className="model-breakdown"><small>BY MODEL</small>{Object.entries(analytics.byModel).map(([model,count])=><p key={model}><span>{model}</span><b>{count}</b></p>)}</article></>:<p>Loading analytics…</p>}</div>}
        {active==='voice'&&<div className="feature-showcase voice-showcase"><span>●</span><h3>Talk instead of typing.</h3><p>The chat recognizes your browser language. Tap the microphone, speak naturally, and the AI will answer in the same language.</p><button className="primary-action" onClick={()=>navigate('/chat')}>Open Voice Chat</button></div>}
        {active==='news'&&<div className="updates-grid">{updates.map(([name,text,badge])=><article key={name}><small>{badge}</small><h3>{name}</h3><p>{text}</p><button onClick={()=>navigate('/explore')}>Explore models →</button></article>)}</div>}
        {active==='sources'&&<div className="feature-showcase"><span>◎</span><h3>Research with sources</h3><p>Smart Router selects a research-focused model and requests citations, publication dates, and a source list.</p><button className="primary-action" onClick={()=>openChat('Research this topic using reliable current sources. Include inline citations, dates, and a source list:\n\n')}>Start research</button></div>}
      </section></div>
  </main>;
}
