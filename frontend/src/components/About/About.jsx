import React from 'react';
import './About.css';

export default function About() {
  return (
    <section id="about" className="about-section">
      <div className="section-header">
        <h2>About AllModelAI</h2>
        <p>Empowering developers and businesses with uniform access to the world's best intelligence</p>
      </div>
      <div className="about-grid">
        <div className="about-card">
          <div className="about-card-icon">⚡</div>
          <h3>Instant Switching</h3>
          <p>Switch between models with zero latency and compare outputs in real-time to find the best fit for your prompts.</p>
        </div>
        <div className="about-card">
          <div className="about-card-icon">🔑</div>
          <h3>Single API Key</h3>
          <p>Eliminate multi-billing and API key management headache. Access all providers via a unified, robust portal.</p>
        </div>
        <div className="about-card">
          <div className="about-card-icon">📈</div>
          <h3>Cost Optimization</h3>
          <p>Automatically route queries to the most cost-effective tier that meets your speed and capability requirements.</p>
        </div>
      </div>
    </section>
  );
}
