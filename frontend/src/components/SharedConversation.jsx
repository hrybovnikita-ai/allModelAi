import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

export default function SharedConversation(){
  const {token}=useParams(); const [chat,setChat]=useState(null); const [error,setError]=useState('');
  useEffect(()=>{fetch(`/api/share/${token}`).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.message);setChat(data)}).catch(err=>setError(err.message))},[token]);
  return <main style={{minHeight:'100vh',background:'#090b12',color:'#edf0fa',padding:'40px max(20px,12vw)',fontFamily:'Inter,system-ui'}}><Link to="/" style={{color:'#9b91ff',textDecoration:'none'}}>AI AllModelAI</Link>{error&&<p>{error}</p>}{!chat&&!error&&<p>Loading shared conversation…</p>}{chat&&<section style={{maxWidth:850,margin:'50px auto'}}><small style={{color:'#958aff'}}>READ-ONLY CONVERSATION</small><h1>{chat.title}</h1><p style={{color:'#8f98ad'}}>Model: {chat.model}</p>{chat.messages.map(message=><article key={message.id} style={{margin:'14px 0',padding:18,border:'1px solid #293044',borderRadius:12,background:message.role==='user'?'#171b27':'#111827'}}><small style={{color:'#958aff'}}>{message.role==='user'?'User':'AI'}</small><p style={{whiteSpace:'pre-wrap',lineHeight:1.65}}>{message.content}</p></article>)}</section>}</main>;
}
