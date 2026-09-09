import { Link } from 'react-router-dom';
import './DashboardResources.css';

const resources = [
  { icon: '01', label: 'PROMPT LIBRARY', title: 'Start with a better question.', description: 'Find a starting point for writing, research, planning, or code and make it your own.', to: '/prompts', action: 'Explore prompts' },
  { icon: '02', label: 'MODEL COMPARISON', title: 'See another perspective.', description: 'Compare answers side by side and find the model that fits the way you work.', to: '/model-comparison', action: 'Compare models' },
  { icon: '03', label: 'DEVELOPER TOOLKIT', title: 'Turn an idea into a build.', description: 'Explore tools for reviewing code, working with data, and planning your next application.', to: '/builder-25', action: 'Open developer tools' },
];

export default function DashboardResources() {
  return (
    <div className="dashboard-resources">
      <section aria-labelledby="dashboard-resources-title">
        <div className="dashboard-resources-heading">
          <div><p className="dashboard-eyebrow">Keep exploring</p><h2 id="dashboard-resources-title">Your next idea starts here.</h2></div>
          <Link to="/features">Explore all features <span aria-hidden="true">&rarr;</span></Link>
        </div>
        <div className="dashboard-resource-grid">
          {resources.map(resource => (
            <div className="dashboard-resource-card" key={resource.to}>
              <span className="dashboard-resource-number" aria-hidden="true">{resource.icon}</span>
              <p className="dashboard-eyebrow">{resource.label}</p>
              <h3>{resource.title}</h3><p>{resource.description}</p>
              <Link to={resource.to}>{resource.action} <span aria-hidden="true">&rarr;</span></Link>
            </div>
          ))}
        </div>
      </section>
      <section className="dashboard-start-guide" aria-labelledby="dashboard-start-title">
        <div><p className="dashboard-eyebrow">A simple place to begin</p><h2 id="dashboard-start-title">From a question to your next step.</h2><p>You bring the idea. Choose the tools that help you move it forward.</p><Link to="/chat?model=smart">Start a conversation <span aria-hidden="true">&rarr;</span></Link></div>
        <ol>
          <li><span aria-hidden="true">01</span><div><h3>Choose your model</h3><p>Explore the library or start with Smart Chat.</p></div></li>
          <li><span aria-hidden="true">02</span><div><h3>Give it some context</h3><p>Describe your goal, audience, and the result you need.</p></div></li>
          <li><span aria-hidden="true">03</span><div><h3>Review and refine</h3><p>Ask follow-up questions and compare another perspective.</p></div></li>
        </ol>
      </section>
      <div className="dashboard-workspace-banner">
        <div><p className="dashboard-eyebrow">Make it yours</p><h2>A workspace that fits your workflow.</h2><p>Set your preferences or pick up your next project in Studio.</p></div>
        <div className="dashboard-banner-links"><Link to="/studio">Open Studio <span aria-hidden="true">&rarr;</span></Link><Link to="/settings">Workspace settings</Link></div>
      </div>
      <footer className="dashboard-footer">
        <div className="dashboard-footer-main">
          <div className="dashboard-footer-brand"><Link to="/" className="dashboard-brand"><span>AI</span>AllModelAI</Link><p>A place to think, build, and explore with AI.</p></div>
          <nav aria-label="Footer workspace"><h3>Workspace</h3><Link to="/chat">Chat</Link><Link to="/model-comparison">Compare models</Link><Link to="/usage-analytics">Usage analytics</Link><Link to="/explore">Model library</Link><Link to="/studio">Studio</Link></nav>
          <nav aria-label="Footer resources"><h3>Resources</h3><Link to="/prompts">Prompt library</Link><Link to="/api-docs">API documentation</Link><Link to="/features">Features</Link></nav>
          <nav aria-label="Footer account"><h3>Account</h3><Link to="/settings">Settings</Link><Link to="/checkout?plan=pro">Plans & upgrades</Link><Link to="/control-center">Control center</Link></nav>
        </div>
        <div className="dashboard-footer-bottom"><small>&copy; {new Date().getFullYear()} AllModelAI</small><nav aria-label="Legal"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/cookies">Cookies</Link></nav></div>
      </footer>
    </div>
  );
}
