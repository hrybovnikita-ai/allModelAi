/** Decorative Visa / Mastercard marks for the card section (display only). */
export default function CardBrandBadges({ className = '' }) {
  return (
    <div className={`card-brand-badges ${className}`.trim()} aria-hidden="true">
      <span className="card-brand-badges__mark card-brand-badges__mark--visa">Visa</span>
      <span className="card-brand-badges__mark card-brand-badges__mark--mc">
        <span className="card-brand-badges__mc-circles" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>Mastercard</span>
      </span>
    </div>
  );
}
