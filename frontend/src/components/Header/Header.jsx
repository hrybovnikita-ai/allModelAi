import React from 'react';
import Navbar from '../Navbar/Navbar';
import './Header.css';

export default function Header() {
  return (
    <header className="header">
      <Navbar />
      <div className="header-content">
        <h1>AllModelAI</h1>
        <p className="tagline">One platform. All AI models. Unlimited possibilities.</p>
      </div>
    </header>
  );
}
