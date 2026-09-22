

export const colors = {
  brand: '#0f62fe',
  brandHover: '#0043ce',
  brand50: '#eef5ff',
  brand100: '#d9e8ff',
  brand200: '#bcd6ff',
  brand700: '#004fd6',
  primaryContainer: '#d0e2ff',
  onPrimaryFixed: '#001d6c',

  navy: '#0f172a',
  apply: '#102a43',

  canvas: '#fcfdfd',
  page: '#f8fafc',
  card: '#ffffff',
  surface: '#f4f4f4',
  surfaceHigh: '#e0e0e0',
  surfaceHighest: '#c6c6c6',

  ink: '#161616',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',

  emerald50: '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald800: '#065f46',
  emerald900: '#064e3b',

  teal50: '#f0fdfa',
  teal100: '#ccfbf1',
  teal200: '#99f6e4',
  teal600: '#0d9488',
  teal700: '#0f766e',
  cyan100: '#cffafe',
  cyan700: '#0e7490',

  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber500: '#f59e0b',
  rose400: '#fb7185',
  rose500: '#f43f5e',
  indigo500: '#6366f1',

  linkedin: '#0a66c2',
  telegram: '#229ed9',
  cutshort: '#4f46e5',
  naukri: '#4a90e2',

  success: '#198038',
  error: '#da1e28',
} as const;

export const font = {
  display: 'Syne_700Bold',
  displayExtra: 'Syne_800ExtraBold',
  displaySemi: 'Syne_600SemiBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemi: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyExtra: 'Manrope_800ExtraBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 999,
} as const;

export const cardShadow = {
  shadowColor: '#0f172a',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
} as const;

export const floatShadow = {
  shadowColor: '#0f62fe',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.35,
  shadowRadius: 25,
  elevation: 8,
} as const;
