import type { TextStyle } from 'react-native';

/**
 * Noto Nastaliq Urdu, bundled with the app and loaded once in the root layout. Nastaliq is the
 * script Urdu readers expect; the system's Arabic fallback renders Urdu in Naskh.
 */
export const URDU_FONTS = {
  NotoNastaliqUrdu: require('../../assets/fonts/NotoNastaliqUrdu-Regular.ttf'),
  'NotoNastaliqUrdu-Bold': require('../../assets/fonts/NotoNastaliqUrdu-Bold.ttf')
};

export const URDU_FONT = { regular: 'NotoNastaliqUrdu', bold: 'NotoNastaliqUrdu-Bold' } as const;

/** Nastaliq glyphs stack high and hang low: they need close to twice the font size as line height. */
export const URDU_LINE_HEIGHT = 1.9;

const isBoldWeight = (weight: TextStyle['fontWeight']) =>
  weight === 'bold' || weight === 'semibold' || weight === 'heavy' || weight === 'black' ||
  (typeof weight === 'number' ? weight >= 600 : Number(weight) >= 600);

/**
 * Overrides that switch a flattened text style to the Urdu typeface. Custom fonts on iOS have no
 * synthetic weights, so bold text uses the separate Bold cut and `fontWeight` is reset.
 */
export function urduTextStyle(flat: TextStyle, bold?: boolean): TextStyle {
  const fontSize = flat.fontSize ?? 15;
  const minLineHeight = Math.round(fontSize * URDU_LINE_HEIGHT);
  return {
    fontFamily: bold || isBoldWeight(flat.fontWeight) ? URDU_FONT.bold : URDU_FONT.regular,
    fontWeight: 'normal',
    letterSpacing: 0,
    lineHeight: Math.max(flat.lineHeight ?? 0, minLineHeight)
  };
}

/** Text inputs in Urdu: the typeface plus the vertical room its tall glyphs need. */
export const URDU_INPUT_STYLE: TextStyle = { fontFamily: URDU_FONT.regular, minHeight: 56, paddingVertical: 8 };
