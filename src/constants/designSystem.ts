export const designSystem = {
  colors: {
    primary: '#2563eb',
    secondary: '#64748b',
    background: '#f7f8fa',
    surface: '#ffffff',
    text: '#1f2937',
    textMuted: '#6b7280',
    border: '#e5e7eb',
    danger: '#dc2626',
  },
  typography: {
    h1: '32px',
    h2: '24px',
    body: '16px',
    caption: '12px',
  },
  spacing: [4, 8, 12, 16, 24, 32],
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
  },
  effects: {
    cardShadow: '0 6px 20px rgba(17, 24, 39, 0.06)',
  },
} as const;
