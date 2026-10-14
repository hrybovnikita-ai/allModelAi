import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../Navbar/Navbar';
import HeroProviderOrbit from './HeroProviderOrbit';
import WindowsDownloadButton from '../Download/WindowsDownloadButton';
import './Header.css';

export default function Header() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const launch = () => prompt.trim() && navigate('/chat?model=smart', { state: { starterPrompt: prompt } });

  return (
    <header className="header" id="home">
      <Navbar />
      <div className="header-content header-content--stack">
        <div className="hero-copy hero-reveal hero-reveal--1">
          <p className="hero-kicker">
            <i aria-hidden="true" />
            THE AI COMMAND CENTER
          </p>
          <h1>
            One prompt.
            <br />
            <span>Every great model.</span>
          </h1>
          <p className="tagline">
            Think, build, research, and compare with the world&apos;s leading AI models in one intelligent workspace.
          </p>
        </div>

        <div className="hero-prompt hero-reveal hero-reveal--2">
          <label className="hero-prompt-label" htmlFor="hero-prompt-input">
            Start a conversation
          </label>
          <textarea
            id="hero-prompt-input"
            aria-label="Prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                launch();
              }
            }}
            placeholder="What do you want to create today?"
            rows={3}
          />
          <div className="hero-prompt-footer">
            <span className="hero-prompt-hint">✦ Smart Router will choose the best model</span>
            <button type="button" className="hero-prompt-send" onClick={launch} disabled={!prompt.trim()} aria-label="Send prompt">
              Send
              <span className="hero-prompt-send-icon" aria-hidden="true">↑</span>
            </button>
          </div>
        </div>

        <div className="hero-actions hero-reveal hero-reveal--3">
          <WindowsDownloadButton variant="hero" />
          <button type="button" onClick={() => navigate('/explore')}>Explore models</button>
          <button type="button" onClick={() => navigate('/arena')}>⚔ Compare in Arena</button>
        </div>

        <div className="hero-orbit-region hero-reveal hero-reveal--4">
          <HeroProviderOrbit />
        </div>
      </div>
    </header>
  );
}
