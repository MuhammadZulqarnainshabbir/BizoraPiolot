import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { employees as employeesApi, inventory } from '@/api/endpoints';
import type { Employee, InventoryUnit, UnitStatus } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { usePagedList } from '@/hooks/usePagedList';
import { colors, space } from '@/theme';
import { UNIT_STATUS_LABEL, UNIT_STATUS_TONE, actorLabel } from '@/utils/labels';
import { Button } from '@/ui/Button';
import { Screen, screenStyles } from '@/ui/Screen';
import { SearchBar } from '@/ui/SearchBar';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { ActionSheet } from '@/ui/dialogs';
import { Alert, Badge, Card, Chips, EmptyState, ListFooter, Loading } from '@/ui/primitives';

type Params = { status?: string; addedBy?: string; needsSerial?: string; search?: string; productId?: string; productName?: string };

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'productName:asc', label: 'Product A–Z' },
  { value: 'sellingPriceCents:desc', label: 'Price: high to low' },
  { value: 'sellingPriceCents:asc', label: 'Price: low to high' }
];

/** Every inventory unit with its serial number; filters by status, who added it, and search. */
export default function InventoryScreen() {
  const { t, money, date } = useFormat();
  const { can } = useAuth();
  const params = useLocalSearchParams<Params>();
  const [status, setStatus] = useState<UnitStatus | ''>('');
  const [needsSerial, setNeedsSerial] = useState(false);
  const [addedBy, setAddedBy] = useState('');
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [sellMenu, setSellMenu] = useState<InventoryUnit | null>(null);
  const viewAll = can('sales.viewAll');

  const summary = useLoad(() => inventory.stockSummary(), []);
  const staff = useLoad(() => viewAll ? employeesApi.list({ page: 1, limit: 100, search: '', sort: 'name', order: 'asc' }) : Promise.resolve(null), [viewAll]);

  const list = usePagedList<InventoryUnit>(
    query => inventory.units(query, { status, addedBy, needsSerial: needsSerial ? 'true' : '', productId }),
    { sort: 'createdAt:desc', fallback: 'Unable to load inventory. Please try again.' },
    [status, addedBy, needsSerial, productId]
  );

  // Links from other screens (e.g. "Available units" on the overview) arrive as params.
  useEffect(() => {
    if (params.status !== undefined) { setStatus((params.status as UnitStatus) || ''); setNeedsSerial(false); }
    if (params.needsSerial === 'true') { setNeedsSerial(true); setStatus(''); }
    if (params.addedBy !== undefined) setAddedBy(params.addedBy);
    if (params.productId !== undefined) { setProductId(params.productId); setProductName(params.productName ?? ''); }
    if (params.search !== undefined) list.setSearchInput(params.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.status, params.needsSerial, params.addedBy, params.productId, params.search]);

  const addedByOptions = useMemo(() => {
    if (!viewAll) return [{ value: '', label: 'Added by anyone' }, { value: 'me', label: 'Added by me' }];
    const people = (staff.data?.records ?? []) as Employee[];
    return [{ value: '', label: 'Added by anyone' }, { value: 'owner', label: 'Shop owner' }, ...people.map(e => ({ value: e._id, label: `${e.name} (${e.employeeId})`, raw: true }))];
  }, [viewAll, staff.data]);

  const s = summary.data;
  const hasFilters = Boolean(list.searchTerm || status || addedBy || needsSerial || productId);
  const canSell = (u: InventoryUnit) => u.status === 'AVAILABLE' && !u.serialPending && can('sales.create');

  const header = (
    <View>
      <Alert text={list.error} />
      {productId ? (
        <Alert kind="info" text="Showing units of {product}." params={{ product: productName || productId }} />
      ) : undefined}
      {s ? (
        <Chips
          value={needsSerial ? 'NEEDS_SERIAL' : status}
          onChange={v => { if (v === 'NEEDS_SERIAL') { setNeedsSerial(true); setStatus(''); } else { setNeedsSerial(false); setStatus(v as UnitStatus | ''); } }}
          options={[
            { value: '', label: 'All units', count: s.total },
            { value: 'AVAILABLE', label: 'Available', count: s.available },
            { value: 'SOLD_FULL_PRICE', label: 'Sold at full price', count: s.soldFullPrice },
            { value: 'SOLD_INSTALLMENT', label: 'Sold on installment', count: s.soldInstallment },
            ...(s.needsSerial ? [{ value: 'NEEDS_SERIAL', label: 'Serial needed', count: s.needsSerial, warn: true }] : [])
          ]}
        />
      ) : undefined}
      <SearchBar value={list.searchInput} onChange={list.setSearchInput} placeholder="Serial, product, brand, model" />
      <View style={styles.controls}>
        <Select compact value={addedBy} options={addedByOptions} onChange={setAddedBy} style={styles.control} />
        <Select compact value={list.sort} options={SORT_OPTIONS} onChange={list.setSort} style={styles.control} />
      </View>
      {productId ? <Button title={t('Show all products')} variant="ghost" small onPress={() => { setProductId(''); setProductName(''); }} /> : null}
      <Txt variant="small" style={styles.count}>{list.total === 1 ? t('1 unit') : t('{count} units', { count: list.total })}</Txt>
      {list.loading && !list.loaded ? <Loading text="Loading inventory..." /> : null}
    </View>
  );

  return (
    <Screen scroll={false} eyebrow="INVENTORY" title="Inventory" subtitle="Every unit in stock, each with its own serial number."
      right={can('inventory.add') ? <Button title={t('＋ Add')} small onPress={() => router.push('/inventory/add')} /> : undefined}>
      <FlatList
        data={list.items}
        keyExtractor={u => u._id}
        contentContainerStyle={screenStyles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.gold} />}
        onEndReachedThreshold={0.4}
        onEndReached={list.loadMore}
        renderItem={({ item: u }) => {
          const [who, whoParams] = actorLabel(u.addedBy);
          return (
            <Card style={styles.unitCard}>
              <View style={styles.unitTop}>
                <View style={styles.unitBody}>
                  <Txt bold numberOfLines={2} onPress={() => router.push(`/inventory/units/${u._id}`)}>{u.productName}</Txt>
                  <Txt variant="small">{u.brand} · {u.model}</Txt>
                </View>
                <Badge label={UNIT_STATUS_LABEL[u.status]} tone={UNIT_STATUS_TONE[u.status]} />
              </View>
              <View style={styles.serialRow}>
                <Txt variant="code" ltr>{u.serialNumber}</Txt>
                {u.serialPending ? <Badge label="Serial needed" tone="red" /> : null}
              </View>
              <Txt variant="small">{money(u.sellingPriceCents)} · {t(who, whoParams)} · {date(u.createdAt, 'medium')}</Txt>
              <View style={styles.actions}>
                <Button title={t('View')} variant="outline" small onPress={() => router.push(`/inventory/units/${u._id}`)} />
                {canSell(u) ? <Button title={t('Mark as sold')} small onPress={() => setSellMenu(u)} /> : null}
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={list.loaded && !list.loading ? (
          <EmptyState icon="cube-outline" title={hasFilters ? 'No matching units' : 'No stock yet'} text={hasFilters ? 'Try a different search or filter.' : 'Add products with their serial numbers to start your inventory.'}
            action={!hasFilters && can('inventory.add') ? <Button title={t('Add stock')} small onPress={() => router.push('/inventory/add')} /> : undefined} />
        ) : undefined}
        ListFooterComponent={
          <View>
            <ListFooter shown={list.items.length} total={list.total} loadingMore={list.loadingMore} hasMore={list.page < list.totalPages} onLoadMore={list.loadMore} />
            <Button title={t('Stock by product')} variant="outline" full onPress={() => router.push('/inventory/products')} />
          </View>
        }
      />
      <ActionSheet
        visible={Boolean(sellMenu)}
        title="Mark as sold"
        onClose={() => setSellMenu(null)}
        actions={sellMenu ? [
          { label: 'Sold at full price', onPress: () => router.push(`/inventory/sell/full-price/${sellMenu._id}`) },
          { label: 'Sold on installment', onPress: () => router.push(`/inventory/sell/installment/${sellMenu._id}`) }
        ] : []}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.sm },
  control: { flex: 1 },
  count: { marginBottom: space.sm },
  unitCard: { marginBottom: space.md, padding: 14 },
  unitTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  unitBody: { flex: 1 },
  serialRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }
});
