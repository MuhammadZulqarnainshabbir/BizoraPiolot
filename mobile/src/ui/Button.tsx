import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '@/theme';
import { Txt } from './Txt';

type Variant = 'primary' | 'outline' | 'danger' | 'ghost' | 'dark';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, small, full, style }: ButtonProps) {
  const inactive = disabled || loading;
  const text = variant === 'primary' || variant === 'dark' ? '#fff' : variant === 'danger' ? colors.danger : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [styles.base, styles[variant], small && styles.small, full && styles.full, inactive && styles.disabled, pressed && !inactive && styles.pressed, style]}
    >
      {loading ? <ActivityIndicator color={text} /> : <Txt bold color={text} style={styles.text}>{title}</Txt>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, flexDirection: 'row' },
  primary: { backgroundColor: colors.gold, borderColor: colors.gold },
  dark: { backgroundColor: colors.ink, borderColor: colors.ink },
  outline: { backgroundColor: '#fff', borderColor: colors.border },
  danger: { backgroundColor: '#fff', borderColor: '#e7b9b9' },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent', minHeight: 40, paddingHorizontal: 10 },
  small: { minHeight: 40, paddingHorizontal: 14, paddingVertical: 8 },
  full: { alignSelf: 'stretch' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8 },
  text: { fontSize: 14.5, textAlign: 'center' }
});
