import React from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useI18n } from '@/i18n/I18nContext';
import { colors, radius, space } from '@/theme';
import { URDU_INPUT_STYLE } from './fonts';
import { Txt } from './Txt';

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Small text after the label, e.g. "Optional". Translated. */
  optional?: string | boolean;
  hint?: string;
  error?: string;
  /** Left-to-right content (emails, serials, IDs), even in Urdu. */
  ltr?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Labelled text input with optional hint and error. Label, hint and error are translated. */
export function Field({ label, optional, hint, error, ltr, style, multiline, ...input }: FieldProps) {
  const { t, isRtl } = useI18n();
  const align = ltr ? 'left' : isRtl ? 'right' : 'left';
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.labelRow}>
        <Txt variant="label">{t(label)}</Txt>
        {optional ? <Txt variant="small" style={styles.optional}>{t(optional === true ? 'Optional' : optional)}</Txt> : null}
      </View>
      <TextInput
        placeholderTextColor="#9a9388"
        maxFontSizeMultiplier={1.35}
        {...input}
        multiline={multiline}
        style={[styles.input, isRtl && !ltr ? URDU_INPUT_STYLE : null, multiline && styles.multiline, error ? styles.inputError : null, { textAlign: align, writingDirection: ltr ? 'ltr' : isRtl ? 'rtl' : 'ltr' }]}
      />
      {error ? <Txt variant="small" color={colors.danger} style={styles.note}>{t(error)}</Txt> : hint ? <Txt variant="small" style={styles.note}>{t(hint)}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 7, flexWrap: 'wrap' },
  optional: { color: colors.goldText, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink, backgroundColor: '#fff', minHeight: 48 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { borderColor: colors.red },
  note: { marginTop: 6 }
});
