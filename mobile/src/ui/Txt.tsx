import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useI18n } from '@/i18n/I18nContext';
import { colors } from '@/theme';
import { urduTextStyle } from './fonts';

export type TxtVariant = 'h1' | 'h2' | 'h3' | 'eyebrow' | 'body' | 'muted' | 'small' | 'label' | 'code' | 'metric' | 'link';

interface TxtProps extends TextProps {
  variant?: TxtVariant;
  /** Force left-to-right (serial numbers, emails, IDs), even in Urdu. */
  ltr?: boolean;
  bold?: boolean;
  color?: string;
  center?: boolean;
  /** Urdu text shown whatever the current language (the language switch). */
  urdu?: boolean;
  style?: StyleProp<TextStyle>;
}

/** Growth cap for the system's accessibility font size, so layouts stay usable at large settings. */
const MAX_FONT_SCALE = 1.35;

/**
 * Text with the app's type styles; aligns right-to-left and switches to the Noto Nastaliq Urdu
 * typeface when the language is Urdu (Latin-only content such as serials keeps the system font).
 */
export function Txt({ variant = 'body', ltr, bold, color, center, urdu, style, ...rest }: TxtProps) {
  const { isRtl } = useI18n();
  const direction = ltr ? styles.ltr : isRtl ? styles.rtl : undefined;
  const base: StyleProp<TextStyle> = [styles.base, styles[variant], direction, bold && styles.bold, color ? { color } : null, center && styles.center, style];
  const nastaliq = (urdu || (isRtl && !ltr)) && variant !== 'code';
  return (
    <Text
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      {...rest}
      style={nastaliq ? [base, urduTextStyle(StyleSheet.flatten(base) ?? {}, bold)] : base}
    />
  );
}

const styles = StyleSheet.create({
  base: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6 },
  h2: { fontSize: 19, lineHeight: 25, fontWeight: '800', letterSpacing: -0.3 },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1.6, color: colors.goldText, textTransform: 'uppercase' },
  body: {},
  muted: { color: colors.muted },
  small: { fontSize: 12.5, lineHeight: 17, color: colors.muted },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  code: { fontFamily: 'Menlo', fontSize: 14, lineHeight: 20 },
  metric: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  link: { color: colors.goldText, fontWeight: '700' },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
  rtl: { writingDirection: 'rtl', textAlign: 'right' }
});
