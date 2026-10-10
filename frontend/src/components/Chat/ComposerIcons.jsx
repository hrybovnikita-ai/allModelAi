/** Lightweight Lucide-style SVG icons (no extra dependency). */
export function ComposerIcon({ children, size = 18, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconPlus() {
  return (
    <ComposerIcon size={20}>
      <path d="M12 5v14M5 12h14" />
    </ComposerIcon>
  );
}

export function IconMic() {
  return (
    <ComposerIcon>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
    </ComposerIcon>
  );
}

export function IconSendUp() {
  return (
    <ComposerIcon size={20}>
      <path d="m5 12 7-7 7 7M12 19V5" />
    </ComposerIcon>
  );
}

export function IconMessageSquare() {
  return (
    <ComposerIcon size={16}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </ComposerIcon>
  );
}

export function IconFileCode() {
  return (
    <ComposerIcon size={16}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M10 13l-2 2 2 2M14 17l2-2-2-2" />
    </ComposerIcon>
  );
}

export function IconImage() {
  return (
    <ComposerIcon size={16}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </ComposerIcon>
  );
}

export function IconSearchDeep() {
  return (
    <ComposerIcon size={16}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3-3M11 8v6M8 11h6" />
    </ComposerIcon>
  );
}

export function IconVolume() {
  return (
    <ComposerIcon size={18}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M17.8 6.2a8.5 8.5 0 0 1 0 11.6" />
    </ComposerIcon>
  );
}

export function IconCamera() {
  return (
    <ComposerIcon size={18}>
      <path d="M14.5 4h-5L7 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3l-2.5-2Z" />
      <circle cx="12" cy="13" r="3" />
    </ComposerIcon>
  );
}

export function IconPaperclip() {
  return (
    <ComposerIcon size={18}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </ComposerIcon>
  );
}

export function IconSparkles() {
  return (
    <ComposerIcon size={18}>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
      <path d="M19 13v4M17 15h4M5 17v2M4 18h2" />
    </ComposerIcon>
  );
}

export function IconVideo() {
  return (
    <ComposerIcon size={18}>
      <path d="m16 13 5-3v8l-5-3v-2Z" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </ComposerIcon>
  );
}

export function IconGlobe() {
  return (
    <ComposerIcon size={18}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
    </ComposerIcon>
  );
}

export function IconGitBranch() {
  return (
    <ComposerIcon size={18}>
      <path d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 0 0 3 3" />
    </ComposerIcon>
  );
}

export function IconStar() {
  return (
    <ComposerIcon size={18}>
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
    </ComposerIcon>
  );
}

export function IconArrowRight() {
  return (
    <ComposerIcon size={18}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </ComposerIcon>
  );
}
