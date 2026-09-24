import dragonLogo from '../../img/gold_dragon_allModelAi.png';
import './AllModelAILogo.css';

export function AllModelAILogoMark({ size = 32, className = '' }) {
  return (
    <img
      src={dragonLogo}
      alt=""
      className={['allmodelai-logo-mark', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      decoding="async"
      draggable={false}
    />
  );
}

export default function AllModelAILogo({ size = 32, className = '', textClassName = '', showText = true }) {
  return (
    <span className={['allmodelai-logo', className].filter(Boolean).join(' ')}>
      <AllModelAILogoMark size={size} />
      {showText ? <span className={['allmodelai-logo-text', textClassName].filter(Boolean).join(' ')}>AllModelAI</span> : null}
    </span>
  );
}
