import { Link } from 'react-router-dom';
import './Workflow.css';

const steps = [
  { number: '01', label: 'Pick a model', title: 'Start with the right voice.', text: 'Compare leading providers in one calm workspace and choose the model that fits the task.' },
  { number: '02', label: 'Send a prompt', title: 'Get moving in seconds.', text: 'Use one focused chat for writing, code, research, and everything between.' },
  { number: '03', label: 'Build the result', title: 'Turn answers into action.', text: 'Save useful conversations, switch models, and keep your best ideas close.' },
];

export default function Workflow() {
  return (
    <section className="workflow-section" aria-labelledby="workflow-title">
      <div className="workflow-intro">
        <span>One simple workflow</span>
        <h2 id="workflow-title">From first thought to finished work.</h2>
        <p>AllModelAI keeps the useful parts of AI together, so you can spend less time configuring tools and more time making progress.</p>
        <Link to="/chat" className="workflow-link">Open prompt studio <b>→</b></Link>
      </div>
      <div className="workflow-steps">
        {steps.map((step) => (
          <article className="workflow-step" key={step.number}>
            <span className="workflow-number">{step.number}</span>
            <span className="workflow-label">{step.label}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
