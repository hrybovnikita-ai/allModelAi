import { WINDOWS_APP_DOWNLOAD_URL, WINDOWS_APP_VERSION_LABEL } from '../../lib/windowsDownload';
import './WindowsDownloadButton.css';

function WindowsIcon({ className = '' }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" d="M3 5.5 10.5 4.2v7.3H3V5.5zm0 8.7h7.5v7.3L3 20.2V14.2zm9-9.3L21 3.8v7.3h-9V4.9zm0 8.7H21v7.3l-9 1.5v-8.8z" />
    </svg>
  );
}

export default function WindowsDownloadButton({ variant = 'hero', className = '' }) {
  return (
    <div className={`windows-download ${variant === 'footer' ? 'windows-download--footer' : ''} ${className}`.trim()}>
      <a
        className="windows-download__button"
        href={WINDOWS_APP_DOWNLOAD_URL}
        download
        rel="noopener noreferrer"
      >
        <WindowsIcon className="windows-download__icon" />
        <span>Download Windows App</span>
      </a>
      <p className="windows-download__badge">{WINDOWS_APP_VERSION_LABEL}</p>
    </div>
  );
}
