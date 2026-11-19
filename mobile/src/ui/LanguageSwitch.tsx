import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LANGUAGES, useI18n } from '@/i18n/I18nContext';
import { colors } from '@/theme';
import { Txt } from './Txt';

/** English / اردو toggle. The choice is remembered on the device. */
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={t('Language')}>
      {LANGUAGES.map(l => {
        const active = l.code === lang;
        return (
          <Pressable key={l.code} onPress={() => setLang(l.code)} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.option, active && styles.active]}>
            <Txt variant="small" bold urdu={l.code === 'ur'} color={active ? '#fff' : colors.ink}>{l.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 999, padding: 3, alignSelf: 'flex-start' },
  option: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  active: { backgroundColor: colors.ink }
});
