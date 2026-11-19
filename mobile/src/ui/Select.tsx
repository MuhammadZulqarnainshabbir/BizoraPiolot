import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useI18n } from '@/i18n/I18nContext';
import { colors, radius, space } from '@/theme';
import { Txt } from './Txt';

export interface SelectOption<V extends string = string> { value: V; label: string; /** Show the label as typed (user data), not translated. */ raw?: boolean; disabled?: boolean; }

interface SelectProps<V extends string> {
  label?: string;
  value: V;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A dropdown: tapping opens a sheet listing the options. Labels are translated unless `raw`. */
export function Select<V extends string>({ label, value, options, onChange, placeholder = 'Choose…', error, hint, compact, disabled, style }: SelectProps<V>) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  const text = current ? (current.raw ? current.label : t(current.label)) : t(placeholder);
  return (
    <View style={[compact ? styles.compactWrap : styles.wrap, style]}>
      {label ? <Txt variant="label" style={styles.label}>{t(label)}</Txt> : null}
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.control, compact && styles.compactControl, error ? styles.controlError : null, disabled && styles.disabled, pressed && styles.pressed]}
      >
        <Txt style={styles.value} color={current ? colors.ink : '#9a9388'} numberOfLines={1}>{text}</Txt>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {error ? <Txt variant="small" color={colors.danger} style={styles.note}>{t(error)}</Txt> : hint ? <Txt variant="small" style={styles.note}>{t(hint)}</Txt> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            {label ? <Txt variant="h3" style={styles.sheetTitle}>{t(label)}</Txt> : null}
            <FlatList
              data={options}
              keyExtractor={o => o.value}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    disabled={item.disabled}
                    onPress={() => { onChange(item.value); setOpen(false); }}
                    style={({ pressed }) => [styles.option, selected && styles.optionSelected, item.disabled && styles.disabled, pressed && styles.pressed]}
                  >
                    <Txt bold={selected} style={styles.optionText}>{item.raw ? item.label : t(item.label)}</Txt>
                    {selected ? <Ionicons name="checkmark" size={18} color={colors.goldText} /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  compactWrap: {},
  label: { marginBottom: 7 },
  control: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactControl: { minHeight: 40, paddingVertical: 6, paddingHorizontal: 12 },
  controlError: { borderColor: colors.red },
  value: { flex: 1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  note: { marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.lg, paddingBottom: space.xxl, maxHeight: '70%' },
  sheetTitle: { paddingHorizontal: space.xl, marginBottom: space.sm },
  list: { flexGrow: 0 },
  option: { paddingHorizontal: space.xl, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
  optionSelected: { backgroundColor: colors.goldTint },
  optionText: { flex: 1 }
});
