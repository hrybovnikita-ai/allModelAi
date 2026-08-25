import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../Navbar/Navbar';
import { dashboardModels } from '../../data/dashboardModels';
import './Header.css';

export default function Header() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const featured = ['gpt', 'claude', 'gemini', 'cloudflare'].map((slug) => dashboardModels.find((model) => model.slug === slug));
  const launch = () => prompt.trim() && navigate('/chat?model=smart', { state: { starterPrompt: prompt } });

  return <header className="header" id="home"><Navbar /><div className="header-content">
    <div className="hero-copy"><p className="hero-kicker"><i /> THE AI COMMAND CENTER</p><h1>One prompt.<br /><span>Every great<br className="headline-break" /> model.</span></h1><p className="tagline">Think, build, research, and compare with the world's leading AI models in one intelligent workspace.</p><div className="hero-prompt"><textarea aria-label="Prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); launch(); } }} placeholder="What do you want to create today?" /><div><span>✦ Smart Router will choose the best model</span><button onClick={launch} disabled={!prompt.trim()}>Send ↑</button></div></div><div className="hero-actions"><button onClick={() => navigate('/explore')}>Explore models</button><button onClick={() => navigate('/arena')}>⚔ Compare in Arena</button></div></div>
    <div className="hero-visual" aria-label="Connected AI models"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="hero-core"><span>AI</span><small>SMART ROUTER</small></div>{featured.map((model, index) => <button style={{ '--index': index }} onClick={() => navigate(`/chat?model=${model.slug}`)} key={model.slug}><img src={model.image} alt="" /><span>{model.name}</span></button>)}<div className="demo-answer"><small>ROUTING COMPLETE · CLAUDE</small><p>I've analyzed your task and selected the best model for thoughtful, structured work.</p><i><span /> Response ready in 1.8s</i></div></div>
  </div></header>;
}
