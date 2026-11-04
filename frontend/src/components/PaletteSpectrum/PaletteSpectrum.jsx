import { AMA_PALETTE } from '../../lib/amaPalette';
import './PaletteSpectrum.css';

export default function PaletteSpectrum() {
  return (
    <section className="ama-spectrum" aria-label="AllModelAI color system">
      <p className="ama-spectrum__label">Color system</p>
      <ul className="ama-spectrum__row">
        {AMA_PALETTE.map(([name, hex]) => (
          <li key={hex} style={{ '--swatch': hex }} title={`${name} ${hex}`}>
            <span className="ama-spectrum__chip" />
            <span className="ama-spectrum__name">{name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
