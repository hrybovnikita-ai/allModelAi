import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CommandPalette.css';

const commands = [
  ['12 Reliability Tools','Provider setup, health checks, privacy, and smart retry','/next-12','12'],
  ['15 New Ideas','Daily planning, quality control, teamwork, learning, and export','/next-15','15'],
  ['30 New Features','Compare, verify, organize, automate, create, and measure','/next-30','30'],
  ['New smart chat','Ask anything and auto-select a model','/chat?model=smart','✦'],
  ['AI Arena','Compare multiple models side by side','/arena','⚔'],
  ['Model Explorer','Search and filter every model','/explore','◈'],
  ['Workspace Studio','Open projects, prompts, and memory','/studio','▦'],
  ['Website Builder','Generate HTML, CSS, and JavaScript with live preview','/website-builder','</>'],
  ['AI Platform','Open all 34 connected AI workspaces','/ai-platform','34'],
  ['Dashboard','View your personal workspace','/dashboard','⌂'],
  ['Settings','Manage your account','/settings','⚙'],
];
export default function CommandPalette(){
  const navigate=useNavigate(); const [open,setOpen]=useState(false); const [query,setQuery]=useState('');
  useEffect(()=>{ const handler=(event)=>{ if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setOpen(value=>!value)} if(event.key==='Escape')setOpen(false)}; window.addEventListener('keydown',handler); return()=>window.removeEventListener('keydown',handler)},[]);
  const visible=useMemo(()=>commands.filter(item=>`${item[0]} ${item[1]}`.toLowerCase().includes(query.toLowerCase())),[query]);
  if(!open)return <button className="command-fab" onClick={()=>setOpen(true)} title="Command palette">⌘ K</button>;
  return <div className="command-backdrop" onMouseDown={()=>setOpen(false)}><section className="command-palette" onMouseDown={e=>e.stopPropagation()}><div className="command-search"><span>⌕</span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search models, tools, and pages…"/><kbd>ESC</kbd></div><p>QUICK ACTIONS</p>{visible.map(([name,description,path,icon])=><button key={name} onClick={()=>{navigate(path);setOpen(false);setQuery('')}}><i>{icon}</i><span><strong>{name}</strong><small>{description}</small></span><b>↵</b></button>)}{!visible.length&&<div className="command-empty">No matching command</div>}<footer><span>↑↓ Navigate</span><span>Enter Open</span><span>Ctrl K Toggle</span></footer></section></div>;
}
