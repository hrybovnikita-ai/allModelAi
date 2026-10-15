import { Link } from 'react-router-dom';
import UserMemorySettings from '../Settings/UserMemorySettings';
import '../Dashboard/DashboardDarkViolet.css';
import '../Dashboard/DashboardLayout.css';
import './AiMemoryPage.css';

export default function AiMemoryPage() {
  return (
    <main className="dashboard-page dashboard-violet ai-memory-page">
      <header className="ai-memory-page-header">
        <div>
          <Link to="/dashboard" className="ai-memory-back">← Dashboard</Link>
          <h1>AI Memory & Learning</h1>
          <p className="ai-memory-lead">
            Opt-in personal context for chat. Memory is off until you enable it. Disabling memory does not turn off chat.
            AllModelAI does not retrain third-party models on your private conversations.
          </p>
        </div>
        <Link to="/settings" className="ai-memory-settings-link">Open Settings</Link>
      </header>
      <UserMemorySettings />
      <section className="ai-memory-privacy" aria-label="Privacy">
        <h2>Privacy controls</h2>
        <ul>
          <li>Memories are isolated to your signed-in account.</li>
          <li>Secrets such as API keys, passwords, and card numbers are blocked from storage.</li>
          <li>You can edit, delete, or clear all memories at any time.</li>
          <li>Feedback sharing is optional and only improves routing quality metrics.</li>
        </ul>
      </section>
    </main>
  );
}
