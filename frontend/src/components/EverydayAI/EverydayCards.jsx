import { Link } from 'react-router-dom';
import { everydayFeatures } from './features';
import './EverydayAI.css';

export default function EverydayCards() {
  return <section className="everyday-cards" id="everyday-ai" aria-labelledby="everyday-heading">
    <p className="everyday-eyebrow">A little less busywork. A lot more possibility.</p>
    <h2 id="everyday-heading">Your everyday AI toolkit.</h2>
    <p>Eight ways to turn a question into something useful.</p>
    <div className="everyday-card-grid">{everydayFeatures.map(([id, number, name, description]) => <Link key={id} to={`/everyday-ai/${id}`}>
      <span>{number} <b aria-hidden="true">↗</b></span><h3>{name}</h3><p>{description}</p>
    </Link>)}</div>
  </section>;
}
