// Visual language shared with the web app (frontend/src/styles.css): charcoal ink, cream
// background, muted gold accents.
export const colors = {
  ink: '#171717',
  cream: '#F7F3EC',
  card: '#FFFFFF',
  beige: '#D8C3A5',
  gold: '#A68A64',
  goldText: '#7A6240',
  goldTint: '#F1E9DC',
  onInk: '#EDE7DC',
  onInkMuted: '#A39B8F',
  muted: '#5f5950',
  border: '#E5DDD0',
  borderSoft: '#EFE9DF',
  danger: '#aa3333',
  dangerBg: '#fff0f0',
  success: '#2e7d4f',
  successBg: '#edf7f0',
  warnText: '#8a5a00',
  warnBg: '#fff6e5',
  infoBg: '#eef3fb',
  infoText: '#2f5fa8',
  green: '#2e7d4f',
  blue: '#2f5fa8',
  violet: '#6b4fa8',
  red: '#c34b4b',
  overlay: 'rgba(23,23,23,0.45)'
} as const;

export const radius = { sm: 9, md: 12, lg: 16, xl: 20 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const shadow = {
  card: {
    shadowColor: '#171717',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  }
} as const;
