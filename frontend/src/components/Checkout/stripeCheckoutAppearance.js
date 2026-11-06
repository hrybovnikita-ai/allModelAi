export const stripeCheckoutAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#818cf8',
    colorBackground: '#0f1424',
    colorText: '#f1f5f9',
    colorTextSecondary: '#94a3b8',
    colorDanger: '#f87171',
    borderRadius: '12px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      border: '1px solid rgba(129, 140, 248, 0.35)',
      boxShadow: 'none',
      backgroundColor: '#111827',
    },
    '.Label': { color: '#cbd5e1', fontWeight: '600' },
    '.Tab': { borderColor: 'rgba(129, 140, 248, 0.25)' },
    '.Tab--selected': { borderColor: '#818cf8' },
  },
};

/** Light Payment Element theme for the Cursor-inspired checkout column. */
export const stripeCheckoutAppearanceLight = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#6d5ef5',
    colorBackground: '#ffffff',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorDanger: '#dc2626',
    borderRadius: '14px',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      border: '1px solid #d1d5db',
      boxShadow: 'none',
      backgroundColor: '#ffffff',
    },
    '.Label': { color: '#475569', fontWeight: '600' },
    '.Tab': { borderColor: '#e5e7eb', backgroundColor: '#f8fafc' },
    '.Tab--selected': { borderColor: '#6d5ef5', backgroundColor: '#ffffff' },
  },
};
