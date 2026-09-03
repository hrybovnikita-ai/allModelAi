import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import './ChatSettings.css';

const colors=[['Blue','#3b82f6'],['Yellow','#facc15'],['Purple','#a855f7'],['Lime','#a3e635'],['Orange','#f97316'],['Red','#ef4444'],['Red orange','#ff4500'],['Violet','#8b5cf6'],['Gray','#9ca3af'],['Green yellow','#adff2f']];
const contrast=hex=>{const value=hex.replace('#','');const channels=[0,2,4].map(index=>Number.parseInt(value.slice(index,index+2),16));return(channels[0]*299+channels[1]*587+channels[2]*114)/1000>155?'#111111':'#ffffff';};

export default function ChatSettings(){
 const saved=sessionStorage.getItem('allmodelai_user'),user=saved?JSON.parse(saved):null;
 const initial=JSON.parse(localStorage.getItem('allmodelai_appearance')||'{}');
 const[theme,setTheme]=useState(initial.theme||'dark');
 const[color,setColor]=useState(!initial.textColor||initial.textColor.toLowerCase()==='#ffffff'?'#8b5cf6':initial.textColor);
 const[inputColor,setInputColor]=useState(initial.inputColor||'#262626');
 useEffect(()=>{const current=JSON.parse(localStorage.getItem('allmodelai_appearance')||'{}');localStorage.setItem('allmodelai_appearance',JSON.stringify({...current,theme,textColor:color,inputColor}));document.documentElement.dataset.themePreference=theme;document.documentElement.dataset.theme=theme==='auto'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):theme;document.documentElement.style.setProperty('--user-text-color',color);document.documentElement.style.setProperty('--user-bubble-text',contrast(color));document.documentElement.style.setProperty('--composer-color',inputColor);document.documentElement.style.setProperty('--composer-text',contrast(inputColor));},[theme,color,inputColor]);
 const chooseTheme=value=>setTheme(value);
 const chooseColor=value=>setColor(value);
 if(!user)return <Navigate to="/" replace/>;
 return <main className="chat-settings-page">
  <header><Link to="/chat" className="settings-page-brand"><span>AI</span>AllModelAI</Link><Link to="/chat" className="back-to-chat">← Back to chat</Link></header>
  <section className="settings-page-hero"><div><span className="settings-page-gear">⚙</span><div><p>PERSONAL CHAT</p><h1>Settings</h1><small>Make your AllModelAI chat feel like your own.</small></div></div><b>Appearance</b></section>
  <div className="settings-page-layout"><section className="settings-options">
   <article><small>INPUT FIELD</small><h2>Choose input color</h2><p>Change the background of the field where you type messages.</p><div className="page-color-grid">{[['Black','#090909'],['Graphite','#262626'],...colors].map(([name,value])=><button className={inputColor===value?'active':''} style={{'--choice':value}} onClick={()=>setInputColor(value)} key={`input-${name}`}><i/><span>{name}</span><b>{inputColor===value?'✓':''}</b></button>)}</div></article>
   <article><small>01 · THEME</small><h2>Choose your theme</h2><p>Change the workspace appearance while keeping the violet AllModelAI accents.</p><div className="page-theme-grid">{[['light','☀','Light','Bright and clean'],['dark','●','Dark','Deep black workspace'],['auto','◐','System','Match your device']].map(([value,icon,name,description])=><button className={theme===value?'active':''} onClick={()=>chooseTheme(value)} key={value}><i>{icon}</i><span><strong>{name}</strong><small>{description}</small></span><b>{theme===value?'✓':''}</b></button>)}</div></article>
   <article><small>02 · MESSAGE BUBBLE</small><h2>Choose your color</h2><p>Your selected color replaces the gray outgoing-message block.</p><div className="page-color-grid">{colors.map(([name,value])=><button className={color===value?'active':''} style={{'--choice':value}} onClick={()=>chooseColor(value)} key={name}><i/><span>{name}</span><b>{color===value?'✓':''}</b></button>)}</div></article>
  </section><aside className="settings-preview"><div><small>LIVE RESULT</small><h2>Your chat preview</h2><p>Changes are saved automatically.</p></div><section><div className="preview-ai"><i>AI</i><p>Hello, {user.name?.split(' ')[0]||'creator'}! What would you like to build today?</p></div><div className="preview-user"><p style={{backgroundColor:color,color:contrast(color)}}>Help me create a great new project</p></div><div className="preview-composer"><span>Message AllModelAI...</span><b>↑</b></div></section><footer><span><i style={{backgroundColor:color}}/>Selected</span><strong>{colors.find(([,value])=>value===color)?.[0]||'Custom'} · {theme}</strong></footer></aside></div>
 </main>;
}
