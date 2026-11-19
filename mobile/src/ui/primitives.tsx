import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useContext, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GRID_GAP, useLayout } from '@/hooks/useLayout';
import { useI18n, type Params } from '@/i18n/I18nContext';
import { colors, radius, shadow, space } from '@/theme';
import { TONE_COLORS, type Tone } from '@/utils/labels';
import { Txt } from './Txt';

// Small building blocks used across screens.

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'default' | 'cream' | 'ink' }) {
  return <View style={[styles.card, tone === 'cream' && styles.cardCream, tone === 'ink' && styles.cardInk, style]}>{children}</View>;
}

/** Translated message box. */
export function Alert({ kind = 'error', text, params, style }: { kind?: 'error' | 'success' | 'info' | 'warning'; text: string; params?: Params; style?: StyleProp<ViewStyle> }) {
  const { t } = useI18n();
  if (!text) return null;
  const look = {
    error: { bg: colors.dangerBg, fg: colors.danger, icon: 'alert-circle' as const },
    success: { bg: colors.successBg, fg: colors.success, icon: 'checkmark-circle' as const },
    info: { bg: colors.infoBg, fg: colors.infoText, icon: 'information-circle' as const },
    warning: { bg: colors.warnBg, fg: colors.warnText, icon: 'warning' as const }
  }[kind];
  return (
    <View style={[styles.alert, { backgroundColor: look.bg }, style]} accessibilityRole="alert">
      <Ionicons name={look.icon} size={18} color={look.fg} style={styles.alertIcon} />
      <Txt color={look.fg} style={styles.alertText}>{t(text, params)}</Txt>
    </View>
  );
}

export function Badge({ label, tone = 'grey', big }: { label: string; tone?: Tone; big?: boolean }) {
  const { t } = useI18n();
  const c = TONE_COLORS[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }, big && styles.badgeBig]}>
      <Txt bold color={c.fg} style={[styles.badgeText, big && styles.badgeTextBig]}>{t(label)}</Txt>
    </View>
  );
}

const GridContext = createContext<number | null>(null);

/**
 * Wrapping grid of Metric tiles: 2 columns on phones, 3 or 4 on tablets and in landscape. It
 * measures its own width, so it lays out correctly inside a card as well as on the page.
 */
export function MetricGrid({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { columns, innerWidth } = useLayout();
  const [measured, setMeasured] = useState(0);
  const tile = Math.floor(((measured || innerWidth) - GRID_GAP * (columns - 1)) / columns);
  return (
    <GridContext.Provider value={tile}>
      <View style={[styles.metricGrid, style]} onLayout={e => setMeasured(Math.round(e.nativeEvent.layout.width))}>{children}</View>
    </GridContext.Provider>
  );
}

/** Dashboard metric card. `onPress` makes it a shortcut. Inside a MetricGrid it takes the grid's tile width. */
export function Metric({ label, value, sub, tone = 'gold', icon, onPress, alert }: { label: string; value: string; sub?: string; tone?: Tone; icon?: React.ComponentProps<typeof Ionicons>['name']; onPress?: () => void; alert?: boolean }) {
  const { t } = useI18n();
  const c = TONE_COLORS[tone];
  const tile = useContext(GridContext);
  const size = tile ? { width: tile, marginBottom: 0 } : null;
  const body = (
    <>
      <View style={styles.metricTop}>
        <Txt variant="small" style={styles.metricLabel}>{t(label)}</Txt>
        {icon ? <View style={[styles.metricIcon, { backgroundColor: c.bg }]}><Ionicons name={icon} size={15} color={c.fg} /></View> : null}
      </View>
      <Txt variant="metric" numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
      {sub ? <Txt variant="small" numberOfLines={2}>{sub}</Txt> : null}
    </>
  );
  if (!onPress) return <View style={[styles.metric, size, alert && styles.metricAlert]}>{body}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.metric, size, alert && styles.metricAlert, pressed && styles.pressed]}>{body}</Pressable>;
}

/** Label above a value, for detail pages. The label is translated; the value is shown as is unless `translateValue`. */
export function Fact({ label, value, sub, ltr, translateValue, flex }: { label: string; value: string; sub?: string; ltr?: boolean; translateValue?: boolean; flex?: boolean }) {
  const { t } = useI18n();
  return (
    <View style={[styles.fact, flex && styles.factFlex]}>
      <Txt variant="eyebrow" style={styles.factLabel}>{t(label)}</Txt>
      <Txt bold ltr={ltr} variant={ltr ? 'code' : 'body'}>{translateValue ? t(value) : value}</Txt>
      {sub ? <Txt variant="small">{sub}</Txt> : null}
    </View>
  );
}

export function FactGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.factGrid}>{children}</View>;
}

export function Loading({ text = 'Loading...' }: { text?: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.loading} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.gold} />
      <Txt variant="small">{t(text)}</Txt>
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, text, action }: { icon?: React.ComponentProps<typeof Ionicons>['name']; title: string; text?: string; action?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={34} color={colors.gold} />
      <Txt bold center style={styles.emptyTitle}>{t(title)}</Txt>
      {text ? <Txt variant="small" center>{t(text)}</Txt> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/** A tappable row with a title, optional subtitle and right-hand content. */
export function Row({ title, subtitle, right, onPress, ltrTitle, children, last }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; ltrTitle?: boolean; children?: React.ReactNode; last?: boolean }) {
  const content = (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowBody}>
        <Txt bold ltr={ltrTitle} numberOfLines={2}>{title}</Txt>
        {subtitle ? <Txt variant="small" numberOfLines={2}>{subtitle}</Txt> : null}
        {children}
      </View>
      {right ? <View style={styles.rowRight}>{right}</View> : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.onInkMuted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{content}</Pressable>;
}

/** Horizontal filter chips with counts. */
export function Chips<V extends string>({ options, value, onChange }: { options: { value: V; label: string; count?: number; warn?: boolean }[]; value: V; onChange: (v: V) => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.chips}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive, o.warn && !active && styles.chipWarn]}>
            <Txt variant="small" bold color={active ? '#fff' : o.warn ? colors.warnText : colors.ink}>{t(o.label)}{o.count !== undefined ? ` ${o.count}` : ''}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Segmented control (e.g. Full price | Installments | History). */
export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.segmented}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, active && styles.segmentActive]}>
            <Txt variant="small" bold color={active ? colors.ink : colors.muted} center>{t(o.label)}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionHeading({ title, text, right }: { title: string; text?: string; right?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingText}>
        <Txt variant="h2">{t(title)}</Txt>
        {text ? <Txt variant="small">{t(text)}</Txt> : null}
      </View>
      {right}
    </View>
  );
}

/** Quick-link row for the home screens. */
export function QuickLink({ icon, title, text, onPress, tone = 'gold' }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string; onPress: () => void; tone?: Tone }) {
  const { t } = useI18n();
  const c = TONE_COLORS[tone];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
      <View style={[styles.quickIcon, { backgroundColor: c.bg }]}><Ionicons name={icon} size={20} color={c.fg} /></View>
      <View style={styles.rowBody}>
        <Txt bold>{t(title)}</Txt>
        <Txt variant="small">{t(text)}</Txt>
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.gold} />
    </Pressable>
  );
}

/** Footer for a FlatList: spinner while more rows load, or "x of y" with a Load more button. */
export function ListFooter({ shown, total, loadingMore, hasMore, onLoadMore }: { shown: number; total: number; loadingMore: boolean; hasMore: boolean; onLoadMore: () => void }) {
  const { t } = useI18n();
  if (!shown) return null;
  return (
    <View style={styles.footer}>
      <Txt variant="small">{t('Showing {start}–{end} of {total}', { start: 1, end: shown, total })}</Txt>
      {loadingMore ? <ActivityIndicator color={colors.gold} /> : hasMore ? (
        <Pressable onPress={onLoadMore} style={styles.loadMore}><Txt variant="link">{t('Load more')}</Txt></Pressable>
      ) : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, padding: space.lg, marginBottom: space.lg, ...shadow.card },
  cardCream: { backgroundColor: colors.cream, borderColor: colors.goldTint },
  cardInk: { backgroundColor: colors.ink, borderColor: colors.ink },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: radius.sm, marginBottom: space.lg },
  alertIcon: { marginTop: 2 },
  alertText: { flex: 1, fontSize: 14, lineHeight: 20 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  badgeBig: { paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 11.5, lineHeight: 15 },
  badgeTextBig: { fontSize: 13, lineHeight: 17 },
  metric: { width: '48%', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSoft, padding: 14, marginBottom: 12, ...shadow.card },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginBottom: space.sm },
  metricAlert: { borderColor: '#e7b9b9', backgroundColor: '#fff8f8' },
  metricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 },
  metricLabel: { flex: 1 },
  metricIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fact: { width: '48%', marginBottom: 14 },
  factFlex: { width: '100%' },
  factLabel: { marginBottom: 3 },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  loading: { padding: space.xl, alignItems: 'center', gap: 8 },
  empty: { padding: space.xl, alignItems: 'center', gap: 6 },
  emptyTitle: { marginTop: 6 },
  emptyAction: { marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLast: { borderBottomWidth: 0 },
  rowBody: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  pressed: { opacity: 0.7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipWarn: { backgroundColor: colors.warnBg, borderColor: '#efd9a8' },
  segmented: { flexDirection: 'row', backgroundColor: colors.goldTint, borderRadius: radius.sm, padding: 3, marginBottom: space.md },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 7 },
  segmentActive: { backgroundColor: '#fff', ...shadow.card },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: space.md },
  sectionHeadingText: { flex: 1 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  quickIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: space.lg, alignItems: 'center', gap: 8 },
  loadMore: { paddingVertical: 6, paddingHorizontal: 12 }
});
