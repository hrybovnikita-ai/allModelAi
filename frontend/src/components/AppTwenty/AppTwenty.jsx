import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import '../NextTen/NextTen.css';
import '../NextTwentyFive/NextTwentyFive.css';

const items=[
 ['install','Installable PWA','Application','Install AllModelAI on desktop or mobile.','install'],
 ['mobile','Mobile Navigation','Application','Use a focused app-style interface on small screens.','/dashboard'],
 ['projects','Project Center','Workspace','Keep chats, documents, prompts, and instructions together.','/studio?tool=project'],
 ['onboarding','First-run Onboarding','Account','Set goals, language, profession, and response preferences.','/chat/settings'],
 ['notifications','Notifications','Application','Receive completion, recovery, job, and credit alerts.','/control-center?feature=notify'],
 ['search','Global Search','Productivity','Search chats, projects, documents, prompts, and tools.','/production'],
 ['favorites','Favorites & Pins','Workspace','Keep important conversations and tools close.','/chat'],
 ['continue','Continue Working','Workspace','Resume recent projects and conversations from the dashboard.','/dashboard'],
 ['profile','User Profile','Account','Manage identity, avatar, language, privacy, and plan.','/settings'],
 ['sync','Device Sync','Application','Continue authenticated workspace activity across devices.','/chat'],
 ['shortcuts','Keyboard Shortcuts','Productivity','Navigate and create faster with keyboard commands.','/chat/settings'],
 ['themes','Themes','Personalization','Choose theme, accent, type size, and density.','/control-center?feature=theme'],
 ['offline','Offline Drafts','Application','Keep drafts and the interface available through connection loss.','/chat'],
 ['feedback','Feedback Center','Support','Report a problem with privacy-safe technical context.','/control-center'],
 ['activity','Activity History','Security','Review usage, jobs, audit events, and account actions.','/production'],
 ['cloud','Cloud Connections','Integrations','Bring external documents and repositories into projects.','/expansion-hub'],
 ['export','Export Center','Workspace','Download results as PDF, Word, Markdown, TXT, or JSON.','/control-center?feature=export'],
 ['achievements','Achievements','Account','Track useful milestones and workspace progress.','/dashboard'],
 ['updates','What’s New','Application','Review product releases and newly available tools.','/features'],
 ['companion','Desktop Companion','Application','Send selected content into fast AI actions.','/chat?model=smart'],
];
const categories=['All',...new Set(items.map(item=>item[2]))];
export default function AppTwenty(){
 const saved=sessionStorage.getItem('allmodelai_user'),user=saved?JSON.parse(saved):null,navigate=useNavigate();
 const [active,setActive]=useState('install'),[query,setQuery]=useState(''),[category,setCategory]=useState('All'),[notice,setNotice]=useState('');
 const visible=useMemo(()=>items.filter(item=>(category==='All'||item[2]===category)&&`${item[1]} ${item[2]} ${item[3]}`.toLowerCase().includes(query.toLowerCase())),[query,category]);
 const selected=items.find(item=>item[0]===active)||items[0];
 if(!user)return <Navigate to="/" replace/>;
 const launch=async()=>{if(selected[4]!=='install')return navigate(selected[4]);const prompt=window.deferredInstallPrompt;if(!prompt){setNotice('AllModelAI is already installed or your browser offers installation from its address-bar menu.');return;}await prompt.prompt();await prompt.userChoice;setNotice('Installation request completed.');};
 return <main className="next-ten-page next-25-page"><header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/next-20">Next 20</Link><Link to="/control-center">Control</Link><Link to="/dashboard">Dashboard</Link></nav></header>
  <section className="next-ten-hero"><div><p>ALLMODEL AI · APP EXPERIENCE</p><h1>More than a website.<br/><span>Your everyday AI app.</span></h1><small>Twenty connected capabilities for installation, productivity, continuity, personalization, and control.</small></div><strong>20</strong></section>
  <section className="next-25-toolbar"><label><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search app features..."/></label><div>{categories.map(value=><button className={category===value?'active':''} onClick={()=>setCategory(value)} key={value}>{value}</button>)}</div></section>
  <section className="next-ten-shell next-25-shell"><aside>{visible.map(item=><button className={active===item[0]?'active':''} onClick={()=>{setActive(item[0]);setNotice('');}} key={item[0]}><i>{String(items.indexOf(item)+1).padStart(2,'0')}</i><span>◆</span><div><strong>{item[1]}</strong><small>{item[2]}</small></div></button>)}</aside><article className="next-ten-panel"><div className="next-ten-panel-title"><span>{String(items.findIndex(item=>item[0]===selected[0])+1).padStart(2,'0')}</span><div><small>{selected[2].toUpperCase()}</small><h2>{selected[1]}</h2></div></div><p className="next-ten-description">{selected[3]}</p><div className="next-ten-flow"><div><i>1</i><span>Open module</span></div><b>→</b><div><i>2</i><span>Configure</span></div><b>→</b><div><i>3</i><span>Use anywhere</span></div></div><button className="next-ten-launch" onClick={launch}>{selected[0]==='install'?'Install application':`Open ${selected[1]}`} <span>→</span></button>{notice&&<p className="verify-result">{notice}</p>}<footer><span>● App module ready</span><small>Connected to your AllModelAI account and workspace.</small></footer></article></section>
 </main>;
}
