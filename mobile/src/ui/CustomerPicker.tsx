import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { customers } from '@/api/endpoints';
import type { CustomerRecord } from '@/api/models';
import { useI18n } from '@/i18n/I18nContext';
import { colors, radius, space } from '@/theme';
import { Button } from './Button';
import { SearchBar } from './SearchBar';
import { Txt } from './Txt';
import { Loading } from './primitives';

/**
 * "Existing customer?" for the sale forms: pick a customer record so the sale is linked to it
 * (its details fill the form). Clearing goes back to typing details, which creates or matches a
 * record when the sale is saved.
 */
export function CustomerPicker({ value, onChange }: { value: CustomerRecord | null; onChange: (customer: CustomerRecord | null) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    const trimmed = term.trim();
    if (trimmed.length < 2) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      customers.search(trimmed).then(list => { if (!cancelled) setResults(list); }).catch(() => { if (!cancelled) setResults([]); }).finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [term, open]);

  return (
    <View style={styles.wrap}>
      {value ? (
        <View style={styles.selected}>
          <View style={styles.avatar}><Txt bold color={colors.goldText}>{value.name.charAt(0).toUpperCase()}</Txt></View>
          <View style={styles.selectedText}>
            <Txt bold>{value.name}</Txt>
            <Txt variant="small" ltr>{value.customerCode} · {value.phone}{value.cnicFormatted ? ` · ${value.cnicFormatted}` : ''}</Txt>
          </View>
          <Button title={t('Change')} variant="outline" small onPress={() => onChange(null)} />
        </View>
      ) : (
        <Pressable onPress={() => { setTerm(''); setResults([]); setOpen(true); }} style={({ pressed }) => [styles.find, pressed && styles.pressed]}>
          <Ionicons name="search" size={18} color={colors.goldText} />
          <Txt variant="link">{t('Find an existing customer')}</Txt>
        </Pressable>
      )}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[styles.sheet, { paddingTop: Math.max(insets.top, space.lg) }]}>
          <View style={styles.sheetHead}>
            <Txt variant="h2">{t('Choose a customer')}</Txt>
            <Button title={t('Close')} variant="ghost" small onPress={() => setOpen(false)} />
          </View>
          <SearchBar value={term} onChange={setTerm} placeholder="Search by name, phone or CNIC" />
          {term.trim().length < 2 ? <Txt variant="small">{t('Type at least 2 characters to search.')}</Txt> : searching && !results.length ? <Loading /> : null}
          <FlatList
            data={results}
            keyExtractor={c => c._id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: c }) => (
              <Pressable onPress={() => { onChange(c); setOpen(false); }} style={({ pressed }) => [styles.result, pressed && styles.pressed]}>
                <View style={styles.selectedText}>
                  <Txt bold>{c.name}</Txt>
                  <Txt variant="small" ltr>{c.phone}{c.cnicFormatted ? ` · ${c.cnicFormatted}` : ''} · {c.customerCode}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onInkMuted} />
              </Pressable>
            )}
            ListEmptyComponent={term.trim().length >= 2 && !searching ? <Txt variant="small">{t('No customer found; the details below will create one.')}</Txt> : undefined}
          />
          <Button title={t('＋ Add customer')} variant="outline" full onPress={() => { setOpen(false); router.push('/customers/new'); }} style={styles.add} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  selected: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.cream },
  selectedText: { flex: 1, gap: 2 },
  avatar: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  find: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gold, borderRadius: radius.md },
  pressed: { opacity: 0.7 },
  sheet: { flex: 1, backgroundColor: colors.cream, padding: space.lg },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  add: { marginTop: space.md, marginBottom: space.xl }
});
