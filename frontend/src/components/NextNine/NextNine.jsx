import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import '../NextTen/NextTen.css';

const ideas = [
  { id:'research', icon:'⌕', title:'AI Deep Research', tag:'Sources', text:'Search the live web, compare sources, and create a structured report with citations.', route:'/expansion-hub?feature=research', action:'Start research' },
  { id:'branches', icon:'⑂', title:'Conversation Branches', tag:'Explore', text:'Continue an answer in a new direction without losing the original conversation.', route:'/chat?feature=branches', action:'Open conversations' },
  { id:'review', icon:'</>', title:'AI Code Critic', tag:'Developer', text:'Review code for bugs, security risks, performance problems, and maintainability.', prompt:'Review this code as a senior engineer. Find correctness bugs, security risks, performance problems, and maintainability issues. Explain each issue and return a corrected complete version:\n\n', action:'Review code' },
  { id:'profile', icon:'◉', title:'Personal AI Profile', tag:'Personal', text:'Control your language, tone, profession, appearance, and preferred answer style.', route:'/settings', action:'Edit AI profile' },
  { id:'canvas', icon:'□', title:'AI Canvas', tag:'Visual', text:'Develop documents, plans, model answers, notes, and ideas in one flexible workspace.', route:'/innovation-hub?feature=canvas', action:'Open Canvas' },
  { id:'meeting', icon:'◌', title:'Meeting Assistant', tag:'Productivity', text:'Turn a transcript into a summary, decisions, action items, owners, and follow-up email.', route:'/expansion-hub?feature=meetings', action:'Process meeting' },
  { id:'automation', icon:'↻', title:'Scheduled Automations', tag:'Recurring', text:'Prepare recurring research, reports, monitoring, and content production tasks.', route:'/innovation-hub?feature=tasks', action:'Create automation' },
  { id:'learning', icon:'△', title:'AI Learning Mode', tag:'Education', text:'Build a personal learning plan with lessons, practice questions, and saved progress.', route:'/studio?tool=learn', action:'Start learning' },
  { id:'facts', icon:'✓', title:'AI Fact Checker', tag:'Trust', text:'Extract claims, verify them against reliable sources, and explain confidence and uncertainty.', prompt:'Fact-check the following content. Extract every important factual claim, verify each with reliable current sources, add direct citations, and label confidence as high, medium, or low:\n\n', action:'Check facts' },
];

export default function NextNine(){
  const saved=sessionStorage.getItem('allmodelai_user');
  const user=saved?JSON.parse(saved):null;
  const navigate=useNavigate();
  const[active,setActive]=useState('research');
  const[input,setInput]=useState('');
  const selected=useMemo(()=>ideas.find(item=>item.id===active)||ideas[0],[active]);
  if(!user)return <Navigate to="/" replace/>;
  const needsInput=Boolean(selected.prompt);
  const launch=()=>{if(needsInput){if(!input.trim())return;navigate('/chat?model=smart',{state:{starterPrompt:`${selected.prompt}${input}`}});return;}navigate(selected.route);};
  return <main className="next-ten-page">
    <header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/next-10">Next 10</Link><Link to="/chat">Chat</Link><Link to="/dashboard">Dashboard</Link></nav></header>
    <section className="next-ten-hero"><div><p>ALLMODEL AI · NEXT 9</p><h1>Nine new ideas.<br/><span>Ready to use.</span></h1><small>Research deeply, branch conversations, review code, learn, automate work, and verify facts from one connected workspace.</small></div><strong>09</strong></section>
    <section className="next-ten-shell">
      <aside>{ideas.map((item,index)=><button type="button" className={active===item.id?'active':''} onClick={()=>{setActive(item.id);setInput('');}} key={item.id}><i>{String(index+1).padStart(2,'0')}</i><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.tag}</small></div></button>)}</aside>
      <article className="next-ten-panel"><div className="next-ten-panel-title"><span>{selected.icon}</span><div><small>{selected.tag.toUpperCase()} MODULE</small><h2>{selected.title}</h2></div></div><p className="next-ten-description">{selected.text}</p>
        {needsInput?<div className="agent-team"><label>{selected.id==='review'?'Code to review':'Content to fact-check'}<textarea value={input} onChange={event=>setInput(event.target.value)} placeholder={selected.id==='review'?'Paste your source code here...':'Paste claims, an article, or an AI answer here...'}/></label></div>:<div className="next-ten-flow"><div><i>1</i><span>Add your material</span></div><b>→</b><div><i>2</i><span>AI analyzes it</span></div><b>→</b><div><i>3</i><span>Save the result</span></div></div>}
        <button type="button" className="next-ten-launch" disabled={needsInput&&!input.trim()} onClick={launch}>{selected.action} <span>→</span></button><footer><span>● Connected</span><small>Every module uses your existing AllModelAI account, models, and workspace.</small></footer>
      </article>
    </section>
  </main>;
}
