import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import '../NextTen/NextTen.css';
import '../NextTwentyFive/NextTwentyFive.css';

const ideas=[
 ['launcher','Unified App Launcher','Navigation','Find tools, models, projects, and favorite actions from one menu.',null,'/ai-platform'],
 ['dashboard','Custom Dashboard','Workspace','Organize the modules and shortcuts that matter most to you.',null,'/dashboard'],
 ['assistant','Floating AI Assistant','AI','Carry a small context-aware assistant across every workspace.','Act as an in-app copilot. Based on the current page, goal, and context below, recommend the next action and help complete it.\n\nCONTEXT:\n'],
 ['split','Split View','Workspace','Work with chat and a document, site, or code artifact side by side.',null,'/website-builder'],
 ['focus','Focus Mode','Chat','Remove distractions and concentrate on one conversation.',null,'/chat'],
 ['bookmarks','Answer Bookmarks','Knowledge','Save valuable paragraphs and code snippets into a project.',null,'/studio?tool=project'],
 ['find','Conversation Search','Chat','Find and revisit exact text inside long conversations.',null,'/chat'],
 ['minimap','Answer Minimap','Chat','Navigate headings, lists, and code blocks in long responses.',null,'/chat'],
 ['toc','Answer Table of Contents','Productivity','Generate clickable structure for a long response.','Create a concise hierarchical table of contents for the material below. Preserve its real heading structure, name unnamed sections clearly, and include short anchor-friendly labels.\n\nMATERIAL:\n'],
 ['continue','Smart Continue','Chat','Continue an answer from its exact stopping point without repetition.',null,'/chat'],
 ['quote','Ask About Selection','Chat','Quote a selected passage and ask a focused follow-up.',null,'/chat'],
 ['slash','Slash Commands','Productivity','Launch image, research, compare, translate, summarize, and code actions.',null,'/chat'],
 ['drop','Drag & Drop Files','Files','Drop documents, images, data, or code directly into chat.',null,'/chat?feature=multimodal'],
 ['naming','AI Project Naming','Workspace','Generate a useful project title, icon, and short description.','Create five concise project names for the context below. For each include an emoji or simple icon, one-line description, and explain which name is strongest.\n\nPROJECT CONTEXT:\n'],
 ['tabs','Workspace Tabs','Navigation','Keep several chats and tools open without losing their state.',null,'/studio'],
];
const categories=['All',...new Set(ideas.map(item=>item[2]))];
export default function NextFifteen(){
 const saved=sessionStorage.getItem('allmodelai_user'),user=saved?JSON.parse(saved):null,navigate=useNavigate();
 const[active,setActive]=useState('launcher'),[category,setCategory]=useState('All'),[query,setQuery]=useState(''),[input,setInput]=useState('');
 const visible=useMemo(()=>ideas.filter(item=>(category==='All'||item[2]===category)&&`${item[1]} ${item[2]} ${item[3]}`.toLowerCase().includes(query.toLowerCase())),[category,query]);
 const selected=ideas.find(item=>item[0]===active)||ideas[0]; if(!user)return <Navigate to="/" replace/>;
 const launch=()=>{if(selected[4]){if(!input.trim())return;navigate('/chat?model=smart',{state:{starterPrompt:`${selected[4]}${input}`}})}else navigate(selected[5])};
 return <main className="next-ten-page next-25-page"><header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/next-30">Next 30</Link><Link to="/chat">Chat</Link><Link to="/dashboard">Dashboard</Link></nav></header>
  <section className="next-ten-hero"><div><p>ALLMODEL AI · NEXT 15</p><h1>Work faster.<br/><span>Stay in your flow.</span></h1><small>Fifteen interface and navigation ideas for handling long answers, many tools, projects, and files.</small></div><strong>15</strong></section>
  <section className="next-25-toolbar"><label><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find an idea..."/></label><div>{categories.map(value=><button className={category===value?'active':''} onClick={()=>setCategory(value)} key={value}>{value}</button>)}</div></section>
  <section className="next-ten-shell next-25-shell"><aside>{visible.map(item=><button className={active===item[0]?'active':''} onClick={()=>{setActive(item[0]);setInput('')}} key={item[0]}><i>{String(ideas.indexOf(item)+1).padStart(2,'0')}</i><span>✦</span><div><strong>{item[1]}</strong><small>{item[2]}</small></div></button>)}</aside><article className="next-ten-panel"><div className="next-ten-panel-title"><span>{String(ideas.findIndex(item=>item[0]===selected[0])+1).padStart(2,'0')}</span><div><small>{selected[2].toUpperCase()} MODULE</small><h2>{selected[1]}</h2></div></div><p className="next-ten-description">{selected[3]}</p>{selected[4]?<div className="agent-team"><label>Context<textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Describe your task or paste the content..."/></label></div>:<div className="next-ten-flow"><div><i>1</i><span>Open</span></div><b>→</b><div><i>2</i><span>Work naturally</span></div><b>→</b><div><i>3</i><span>Keep context</span></div></div>}<button className="next-ten-launch" disabled={Boolean(selected[4])&&!input.trim()} onClick={launch}>Open {selected[1]} <span>→</span></button><footer><span>● Module ready</span><small>Connected to your AllModelAI workspace and chat.</small></footer></article></section>
 </main>;
}
