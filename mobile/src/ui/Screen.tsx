import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_CONTENT_WIDTH, useLayout } from '@/hooks/useLayout';
import { useI18n, type Params } from '@/i18n/I18nContext';
import { colors, space } from '@/theme';
import { Txt } from './Txt';

interface ScreenProps {
  title?: string;
  titleParams?: Params;
  /** Title shown as typed (user data such as a product name), not translated. */
  rawTitle?: boolean;
  eyebrow?: string;
  subtitle?: string;
  /** Subtitle shown as typed, not translated. */
  rawSubtitle?: boolean;
  /** Show a back button (when there is somewhere to go back to). */
  back?: boolean;
  right?: React.ReactNode;
  /** false: render children directly (for screens that own a FlatList). */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  children: React.ReactNode;
}

/** Page shell: safe area, cream background, heading with optional back button, scrolling body. */
export function Screen({ title, titleParams, rawTitle, eyebrow, subtitle, rawSubtitle, back, right, scroll = true, refreshing, onRefresh, children }: ScreenProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { padding, contentWidth } = useLayout();
  // Fills the phone; on tablets and in landscape it is capped and centred.
  const page = { maxWidth: contentWidth, width: '100%' as const, alignSelf: 'center' as const };
  const canGoBack = back && router.canGoBack();
  const header = (title || eyebrow || canGoBack || right) ? (
    <View style={styles.header}>
      {canGoBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => router.back()} style={styles.back} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        {eyebrow ? <Txt variant="eyebrow">{t(eyebrow)}</Txt> : null}
        {title ? <Txt variant="h1" numberOfLines={2}>{rawTitle ? title : t(title, titleParams)}</Txt> : null}
        {subtitle ? <Txt variant="small">{rawSubtitle ? subtitle : t(subtitle)}</Txt> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  ) : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {scroll ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, page, { paddingHorizontal: padding, paddingTop: padding }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.gold} /> : undefined}
          >
            {header}
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>
          <View style={[styles.listHeader, page, { paddingHorizontal: padding, paddingTop: padding }]}>{header}</View>
          {children}
        </View>
      )}
    </View>
  );
}

export const screenStyles = StyleSheet.create({
  /** Horizontal padding for list content when `scroll` is false. */
  listContent: { paddingHorizontal: space.lg, paddingBottom: space.xxl, maxWidth: MAX_CONTENT_WIDTH, width: '100%', alignSelf: 'center' }
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },
  listHeader: { paddingHorizontal: space.lg, paddingTop: space.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: space.lg },
  back: { marginLeft: -6, marginTop: 2, padding: 2 },
  headerText: { flex: 1, gap: 2 },
  right: { marginTop: 2 }
});
