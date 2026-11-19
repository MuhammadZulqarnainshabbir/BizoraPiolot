import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useI18n } from '@/i18n/I18nContext';
import { colors, radius, space } from '@/theme';
import { URDU_FONT } from './fonts';

export function SearchBar({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t, isRtl } = useI18n();
  return (
    <View style={[styles.wrap, isRtl && styles.wrapUrdu]}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t(placeholder)}
        placeholderTextColor="#9a9388"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        maxLength={100}
        maxFontSizeMultiplier={1.35}
        style={[styles.input, isRtl && styles.inputUrdu, { textAlign: isRtl ? 'right' : 'left' }]}
        accessibilityLabel={t(placeholder)}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel={t('Clear search')}>
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, minHeight: 44, marginBottom: space.md },
  input: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 8 },
  wrapUrdu: { minHeight: 52 },
  inputUrdu: { fontFamily: URDU_FONT.regular }
});
