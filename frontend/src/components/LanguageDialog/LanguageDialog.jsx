import { useEffect, useRef } from 'react';
import { useLanguage } from '../../lib/useLanguage';

export default function LanguageDialog({ onConfirm, onCancel }) {
  const { t } = useLanguage();
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => previous?.focus();
  }, []);
  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
    if (event.key === 'Tab') {
      const buttons = [...dialog.current.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      event.preventDefault();
      buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    }
  };
  return <div className="language-confirm-overlay" onClick={onCancel}>
    <section ref={dialog} className="language-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="language-confirm-title" onKeyDown={onKeyDown} onClick={event => event.stopPropagation()}>
      <h3 id="language-confirm-title">{t('confirmTitle')}</h3><p>{t('confirmText')}</p>
      <div className="language-confirm-actions"><button type="button" className="confirm-yes" onClick={onConfirm}>{t('yes')}</button><button type="button" className="confirm-no" onClick={onCancel}>{t('no')}</button></div>
    </section>
  </div>;
}
