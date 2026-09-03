import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import '../NextTen/NextTen.css';
import '../NextTwentyFive/NextTwentyFive.css';

const prompt=(role,output)=>`Act as ${role}. Analyze the input carefully, state assumptions, do not invent unavailable facts, and produce ${output}.\n\nINPUT:\n`;
const tools=[
 ['autopilot','AI Model Autopilot','Autopilot','Plan and execute a goal using the right models and tools.',prompt('an AI orchestration architect','an ordered execution plan with model choices, tool calls, checkpoints, risks, and a final success test')],
 ['convert','Universal File Converter','Productivity','Plan safe conversion between common document and data formats.',prompt('a document conversion specialist','the converted content when possible, preservation warnings, and exact conversion steps')],
 ['email','Email Assistant','Business','Summarize threads, draft replies, and extract actions.',prompt('an expert executive email assistant','a thread summary, decisions, action items with owners, and a concise reply draft')],
 ['calendar','Calendar Copilot','Productivity','Turn goals and constraints into an effective schedule.',prompt('a scheduling copilot','a conflict-aware agenda, preparation checklist, buffers, and follow-up plan')],
 ['github','GitHub Repository Assistant','Developer','Understand repositories, architecture, risks, and changes.',prompt('a senior repository engineer','an architecture map, important files, risks, and a file-by-file implementation plan')],
 ['pr','Pull Request Reviewer','Developer','Review code changes for correctness and security.',prompt('a strict pull-request reviewer','findings ordered by severity with evidence, impact, and precise fixes')],
 ['bug','Bug Reproduction Agent','Developer','Create reliable reproduction steps and regression tests.',prompt('a software QA engineer','minimal reproduction steps, expected versus actual behavior, likely causes, and a regression-test design')],
 ['api','API Integration Builder','Developer','Build integrations from API specifications.',prompt('an API integration engineer','authentication setup, typed request examples, retries, validation, error handling, and tests')],
 ['database','Database Playground','Developer','Design safe SQL and database verification plans.',null,'/skills-hub'],
 ['logs','Log Analyzer','Developer','Group failures and identify likely root causes.',prompt('a production incident engineer','a normalized incident timeline, error clusters, root-cause hypotheses, verification commands, and safe fixes')],
 ['graph','Knowledge Graph','Knowledge','Explore relationships between workspace information.',null,'/expansion-hub?feature=memory'],
 ['meeting','Automatic Meeting Bot','Content','Extract decisions and work from meeting transcripts.',null,'/expansion-hub?feature=meetings'],
 ['video','Video Summary','Content','Create chapters, highlights, and study notes.',prompt('a video analysis editor','a concise summary, timestamp-ready chapter plan, key claims, quotes-to-verify, and follow-up questions')],
 ['podcast','Podcast Studio','Content','Develop episodes, scripts, descriptions, and chapters.',prompt('a podcast producer','an episode concept, structured script, host cues, chapter markers, title options, and show notes')],
 ['image','Image Editing Workspace','Content','Plan and create precise visual edits.',null,'/creator-tools'],
 ['brand','Brand Voice Manager','Content','Define and enforce a consistent brand style.',prompt('a brand voice strategist','voice principles, do/don’t rules, vocabulary, examples, and a compliance review of the supplied content')],
 ['repurpose','Content Repurposing Pipeline','Content','Turn one source into channel-native assets.',prompt('a multi-channel content strategist','an article outline, email, social posts, short-video script, and a repurposing calendar')],
 ['social','Social Media Scheduler','Content','Create platform-specific publishing calendars.',null,'/skills-hub'],
 ['seo','SEO Content Monitor','Business','Audit content and prioritize useful updates.',prompt('a technical SEO content analyst','an evidence-based content audit, decay risks, refresh priorities, internal-link plan, and measurement checklist')],
 ['competitor','Competitor Watch','Business','Structure recurring competitor product monitoring.',null,'/expansion-hub?feature=research'],
 ['support','Customer Support Copilot','Business','Draft grounded, empathetic customer answers.',null,'/skills-hub'],
 ['tickets','Ticket Auto-Triage','Business','Classify, prioritize, route, and escalate requests.',prompt('a support operations lead','category, urgency, sentiment, routing team, SLA recommendation, and escalation reason')],
 ['leads','CRM Lead Scoring','Business','Score leads transparently without hidden assumptions.',prompt('an ethical revenue-operations analyst','a transparent scoring rubric, per-lead score, evidence, uncertainty, and recommended next action')],
 ['sales','Sales Call Coach','Business','Review objections, discovery, and next steps.',prompt('an ethical sales coach','call summary, needs discovered, objections, missed questions, coaching notes, and a respectful follow-up')],
 ['invoice','Invoice & Receipt Analyzer','Business','Check extracted financial records for inconsistencies.',prompt('an accounts-payable reviewer','structured line items, totals and tax reconciliation, duplicates, anomalies, and fields requiring human verification')],
 ['contract','Contract Version Comparison','Business','Compare clauses and highlight changed risk.',null,'/skills-hub'],
 ['learn','Personal Learning Coach','Knowledge','Adapt lessons and exercises to learner progress.',null,'/studio?tool=learn'],
 ['gaps','Team Knowledge Gaps','Knowledge','Find questions the knowledge base cannot answer.',prompt('a knowledge-management analyst','a gap inventory, business impact, missing sources, owners, and a prioritized documentation backlog')],
 ['sdk','Plugin & Tool SDK','Platform','Design extensions for AllModelAI.',null,'/api-docs'],
 ['white','White-label Workspaces','Platform','Configure branded client and company workspaces.',null,'/settings'],
];
const categories=['All',...new Set(tools.map(item=>item[2]))];
export default function NextThirty(){
 const saved=sessionStorage.getItem('allmodelai_user'),user=saved?JSON.parse(saved):null,navigate=useNavigate();
 const[active,setActive]=useState('autopilot'),[category,setCategory]=useState('All'),[query,setQuery]=useState(''),[input,setInput]=useState('');
 const visible=useMemo(()=>tools.filter(item=>(category==='All'||item[2]===category)&&`${item[1]} ${item[2]} ${item[3]}`.toLowerCase().includes(query.toLowerCase())),[category,query]);
 const selected=tools.find(item=>item[0]===active)||tools[0]; if(!user)return <Navigate to="/" replace/>;
 const launch=()=>{if(selected[4]){if(!input.trim())return;navigate('/chat?model=smart',{state:{starterPrompt:`${selected[4]}${input}`}})}else navigate(selected[5])};
 return <main className="next-ten-page next-25-page"><header className="next-ten-nav"><Link to="/dashboard" className="next-ten-brand"><b>AI</b>AllModelAI</Link><nav><Link to="/app-20">App 20</Link><Link to="/power-center">Power Center</Link><Link to="/dashboard">Dashboard</Link></nav></header>
  <section className="next-ten-hero"><div><p>ALLMODEL AI · NEXT 30</p><h1>From assistant<br/><span>to operating system.</span></h1><small>Thirty practical tools for software, knowledge, content, business operations, integrations, and autonomous work.</small></div><strong>30</strong></section>
  <section className="next-25-toolbar"><label><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a tool..."/></label><div>{categories.map(value=><button className={category===value?'active':''} onClick={()=>setCategory(value)} key={value}>{value}</button>)}</div></section>
  <section className="next-ten-shell next-25-shell"><aside>{visible.map(item=><button className={active===item[0]?'active':''} onClick={()=>{setActive(item[0]);setInput('')}} key={item[0]}><i>{String(tools.indexOf(item)+1).padStart(2,'0')}</i><span>✦</span><div><strong>{item[1]}</strong><small>{item[2]}</small></div></button>)}</aside><article className="next-ten-panel"><div className="next-ten-panel-title"><span>{String(tools.findIndex(item=>item[0]===selected[0])+1).padStart(2,'0')}</span><div><small>{selected[2].toUpperCase()} TOOL</small><h2>{selected[1]}</h2></div></div><p className="next-ten-description">{selected[3]}</p>{selected[4]?<div className="agent-team"><label>Task input<textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste source material or describe the goal..."/></label></div>:<div className="next-ten-flow"><div><i>1</i><span>Add context</span></div><b>→</b><div><i>2</i><span>Run workflow</span></div><b>→</b><div><i>3</i><span>Review output</span></div></div>}<button className="next-ten-launch" disabled={Boolean(selected[4])&&!input.trim()} onClick={launch}>Open {selected[1]} <span>→</span></button><footer><span>● Tool ready</span><small>Connected to Smart Router, workspace, projects, and usage controls.</small></footer></article></section>
 </main>;
}
