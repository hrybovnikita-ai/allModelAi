import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../lib/useLanguage';
import { PROJECT_COLORS, PROJECT_ICONS } from './createProjectConstants.js';
import './CreateProjectModal.css';

export { PROJECT_COLORS, PROJECT_ICONS } from './createProjectConstants.js';

export function ProjectIconBadge({ project, className = '' }) {
  const color = project?.color || '#52525b';
  const icon = project?.icon || '📁';
  return (
    <span
      className={`project-icon-badge ${className}`.trim()}
      style={{ background: color }}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

export default function CreateProjectModal({ onClose, onCreate }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [color, setColor] = useState(PROJECT_COLORS[0].value);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [iconQuery, setIconQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const filteredIcons = useMemo(() => {
    const query = iconQuery.trim().toLowerCase();
    if (!query) return PROJECT_ICONS;
    return PROJECT_ICONS.filter((item) => item.includes(query));
  }, [iconQuery]);

  const submit = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate({ name: trimmed, icon, color });
  };

  return createPortal(
    <div className="create-project-backdrop" role="presentation" onClick={onClose}>
      <section
        className="create-project-modal"
        lang="en"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="create-project-header">
          <h2 id="create-project-title">{t('Create project')}</h2>
          <button type="button" className="create-project-close" onClick={onClose} aria-label={t('Close')}>
            ×
          </button>
        </header>

        <form className="create-project-form" onSubmit={submit}>
          <label className="create-project-label" htmlFor="create-project-name">
            {t('Project name')}
          </label>

          <div className="create-project-name-row">
            <button
              type="button"
              className="create-project-icon-trigger"
              style={{ background: color }}
              aria-expanded={pickerOpen}
              aria-label={t('Choose icon and color')}
              onClick={() => setPickerOpen((open) => !open)}
            >
              {icon}
            </button>
            <input
              id="create-project-name"
              className="create-project-name-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('Project name placeholder')}
              autoFocus
              maxLength={80}
            />
          </div>

          {pickerOpen && (
            <div className="create-project-picker">
              <div className="create-project-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={iconQuery}
                  onChange={(event) => setIconQuery(event.target.value)}
                  placeholder={t('Search icons')}
                  aria-label={t('Search icons')}
                />
              </div>

              <div className="create-project-colors" role="listbox" aria-label={t('Project color')}>
                {PROJECT_COLORS.map((swatch) => (
                  <button
                    key={swatch.id}
                    type="button"
                    role="option"
                    aria-selected={color === swatch.value}
                    className={color === swatch.value ? 'selected' : ''}
                    style={{ background: swatch.value }}
                    onClick={() => setColor(swatch.value)}
                    title={swatch.id}
                  />
                ))}
              </div>

              <div className="create-project-icons" role="listbox" aria-label={t('Project icon')}>
                {filteredIcons.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={icon === item}
                    className={icon === item ? 'selected' : ''}
                    onClick={() => setIcon(item)}
                  >
                    {item}
                  </button>
                ))}
                {filteredIcons.length === 0 && (
                  <p className="create-project-icons-empty">{t('No icons found')}</p>
                )}
              </div>
            </div>
          )}

          <footer className="create-project-footer">
            <button type="submit" className="create-project-submit" disabled={!name.trim()}>
              {t('Create project')}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}
