import { File, Paths } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { dashboard, employees as employeesApi, sales } from '@/api/endpoints';
import type { Agreement, Employee, Sale } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { usePagedList } from '@/hooks/usePagedList';
import { colors, space } from '@/theme';
import { AGREEMENT_STATUS_LABEL, AGREEMENT_STATUS_TONE, PAYMENT_METHOD_LABEL, SALE_STATUS_LABEL, SALE_STATUS_TONE, SALE_TYPE_LABEL, actorLabel } from '@/utils/labels';
import { Button } from '@/ui/Button';
import { Screen, screenStyles } from '@/ui/Screen';
import { SearchBar } from '@/ui/SearchBar';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { Alert, Badge, Card, Chips, EmptyState, ListFooter, Loading, Metric, MetricGrid, Segmented } from '@/ui/primitives';

type Tab = 'full-price' | 'installments' | 'history';
type AgreementFilter = '' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED';

/** Sales tab: full-price sales, installment agreements and the combined history. Owners see the whole shop; employees their own sales. */
export default function SalesScreen() {
  const params = useLocalSearchParams<{ tab?: string; status?: string }>();
  const [tab, setTab] = useState<Tab>('full-price');
  const [status, setStatus] = useState<AgreementFilter>('');
  const [soldBy, setSoldBy] = useState('');
  useEffect(() => {
    if (params.tab === 'full-price' || params.tab === 'installments' || params.tab === 'history') setTab(params.tab);
    if (params.status !== undefined) setStatus((params.status as AgreementFilter) || '');
  }, [params.tab, params.status]);
  const { can } = useAuth();
  const viewAll = can('sales.viewAll');
  const staff = useLoad(() => viewAll ? employeesApi.list({ page: 1, limit: 100, search: '', sort: 'name', order: 'asc' }) : Promise.resolve(null), [viewAll]);
  const soldByOptions = useMemo(() => {
    const people = (staff.data?.records ?? []) as Employee[];
    return [{ value: '', label: 'Sold by anyone' }, { value: 'owner', label: 'Shop owner' }, ...people.map(e => ({ value: e._id, label: `${e.name} (${e.employeeId})`, raw: true }))];
  }, [staff.data]);
  const controls = (
    <View>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'full-price', label: 'Full price' }, { value: 'installments', label: 'Installments' }, { value: 'history', label: 'History' }]} />
      {viewAll ? <Select compact value={soldBy} options={soldByOptions} onChange={setSoldBy} style={styles.soldBy} /> : null}
    </View>
  );

  return (
    <Screen scroll={false} eyebrow="SALES" title={viewAll ? 'Sales' : 'My sales'} subtitle={viewAll ? 'Every sale in your shop.' : 'The units you sold.'}>
      {tab === 'full-price' ? <FullPriceList controls={controls} soldBy={soldBy} /> : null}
      {tab === 'installments' ? <InstallmentList controls={controls} soldBy={soldBy} status={status} setStatus={setStatus} /> : null}
      {tab === 'history' ? <HistoryList controls={controls} soldBy={soldBy} /> : null}
    </Screen>
  );
}

/** Downloads a CSV export (owner) and opens the share sheet so it can be saved or sent. */
function useExport(kind: 'full-price' | 'installment', filters: Record<string, string>) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setExporting(true);
    setError('');
    try {
      const { text, filename } = await sales.exportCsv(kind, filters);
      const name = (filename ?? `${kind}-sales.csv`).replace(/\.csv$/i, '') + `-${Date.now()}.csv`;
      const file = new File(Paths.cache, name);
      file.create();
      await file.write(text);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: name });
      else setError('Sharing isn’t available on this device.');
    } catch (e) {
      setError(errorMessage(e, 'Unable to export. Please try again.'));
    } finally {
      setExporting(false);
    }
  };
  return { run, exporting, error };
}

function SaleRow({ sale }: { sale: Sale }) {
  const { t, money, date } = useFormat();
  const [who, whoParams] = actorLabel(sale.soldBy);
  return (
    <Card style={styles.rowCard}>
      <View style={styles.rowTop}>
        <View style={styles.rowBody}>
          <Txt bold numberOfLines={2} onPress={() => router.push(`/sales/${sale._id}`)}>{sale.item.productName}</Txt>
          <Txt variant="small"><Txt variant="small" ltr>{sale.saleNumber}</Txt> · {t(SALE_TYPE_LABEL[sale.type])} · <Txt variant="small" ltr>{sale.item.serialNumber}</Txt></Txt>
        </View>
        <Badge label={SALE_STATUS_LABEL[sale.status]} tone={SALE_STATUS_TONE[sale.status]} />
      </View>
      <View style={styles.rowMeta}>
        <Txt bold>{money(sale.salePriceCents)}</Txt>
        <Txt variant="small">{t(PAYMENT_METHOD_LABEL[sale.paymentMethod])} · {t(who, whoParams)} · {date(sale.soldAt, 'medium')}</Txt>
      </View>
      {sale.customer?.name ? <Txt variant="small">{sale.customer.name}{sale.customer.phone ? ` · ${sale.customer.phone}` : ''}</Txt> : null}
      {sale.agreement ? <Txt variant="small">{t('{collected} collected · {balance} remaining', { collected: money(sale.agreement.collectedCents), balance: money(sale.agreement.balanceCents) })} · {t(AGREEMENT_STATUS_LABEL[sale.agreement.displayStatus])}</Txt> : null}
      <View style={styles.rowActions}>
        <Button title={t('View')} variant="outline" small onPress={() => router.push(`/sales/${sale._id}`)} />
        {sale.installmentAgreementId ? <Button title={t('Agreement')} variant="ghost" small onPress={() => router.push(`/sales/installments/${sale.installmentAgreementId}`)} /> : null}
      </View>
    </Card>
  );
}

function AgreementRow({ agreement: a }: { agreement: Agreement }) {
  const { t, money, date } = useFormat();
  return (
    <Card style={styles.rowCard}>
      <View style={styles.rowTop}>
        <View style={styles.rowBody}>
          <Txt bold numberOfLines={2} onPress={() => router.push(`/sales/installments/${a._id}`)}>{a.customer.name}</Txt>
          <Txt variant="small"><Txt variant="small" ltr>{a.agreementNumber}</Txt> · {a.item.productName} · <Txt variant="small" ltr>{a.item.serialNumber}</Txt></Txt>
        </View>
        <Badge label={AGREEMENT_STATUS_LABEL[a.displayStatus]} tone={AGREEMENT_STATUS_TONE[a.displayStatus]} />
      </View>
      <Txt variant="small">{t('{collected} collected · {balance} remaining', { collected: money(a.collectedCents), balance: money(a.balanceCents) })} {t('of {total}', { total: money(a.totalPriceCents) })}</Txt>
      {a.nextDueDate ? <Txt variant="small" color={a.overdue ? colors.danger : undefined}>{t('Next due {date}: {amount}', { date: date(a.nextDueDate), amount: money(a.nextDueCents ?? 0) })}{a.overdueCents ? ` · ${t('{amount} overdue', { amount: money(a.overdueCents) })}` : ''}</Txt> : null}
      <View style={styles.rowActions}>
        <Button title={t('View')} variant="outline" small onPress={() => router.push(`/sales/installments/${a._id}`)} />
      </View>
    </Card>
  );
}

function FullPriceList({ controls, soldBy }: { controls: React.ReactNode; soldBy: string }) {
  const { t, money } = useFormat();
  const { can } = useAuth();
  const owner = can('dashboard.operational');
  const stats = useLoad(() => owner ? dashboard.fullPriceStats() : Promise.resolve(null), [owner]);
  const list = usePagedList<Sale>(query => sales.fullPrice(query, { soldBy }), { sort: 'soldAt:desc', fallback: 'Unable to load sales. Please try again.' }, [soldBy]);
  const exporter = useExport('full-price', soldBy ? { soldBy } : {});
  const s = stats.data?.totals;

  const header = (
    <View>
      {controls}
      <Alert text={list.error} />
      <Alert text={exporter.error} />
      {s ? (
        <MetricGrid>
          <Metric label="Today" value={money(s.todayCents)} sub={s.todayCount === 1 ? t('1 sale') : t('{count} sales', { count: s.todayCount })} tone="green" icon="today-outline" />
          <Metric label="This week" value={money(s.weekCents)} sub={s.weekCount === 1 ? t('1 sale') : t('{count} sales', { count: s.weekCount })} tone="green" icon="calendar-outline" />
          <Metric label="This month" value={money(s.monthCents)} sub={s.monthCount === 1 ? t('1 sale') : t('{count} sales', { count: s.monthCount })} tone="green" icon="calendar-outline" />
          <Metric label="All time" value={money(s.valueCents)} sub={t('{count} sales · {discount} in discounts', { count: s.count, discount: money(s.discountCents) })} tone="gold" icon="trending-up-outline" />
        </MetricGrid>
      ) : undefined}
      <SearchBar value={list.searchInput} onChange={list.setSearchInput} placeholder="Sale number, product, serial, customer" />
      <View style={styles.countRow}>
        <Txt variant="small">{list.total === 1 ? t('1 sale') : t('{count} sales', { count: list.total })}</Txt>
        {can('reports.export') ? <Button title={t(exporter.exporting ? 'Exporting...' : 'Export CSV')} variant="ghost" small loading={exporter.exporting} onPress={() => void exporter.run()} /> : null}
      </View>
      {list.loading && !list.loaded ? <Loading /> : null}
    </View>
  );

  return (
    <FlatList
      data={list.items}
      keyExtractor={x => x._id}
      contentContainerStyle={screenStyles.listContent}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => { void list.refresh(); void stats.silentReload(); }} tintColor={colors.gold} />}
      onEndReachedThreshold={0.4}
      onEndReached={list.loadMore}
      renderItem={({ item }) => <SaleRow sale={item} />}
      ListEmptyComponent={list.loaded && !list.loading ? <EmptyState icon="receipt-outline" title={list.searchTerm || soldBy ? 'No matching sales' : 'No full-price sales yet'} text={list.searchTerm || soldBy ? 'Try a different search or filter.' : 'Find a unit in Inventory and use “Mark as sold”.'} /> : undefined}
      ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} loadingMore={list.loadingMore} hasMore={list.page < list.totalPages} onLoadMore={list.loadMore} />}
    />
  );
}

function InstallmentList({ controls, soldBy, status, setStatus }: { controls: React.ReactNode; soldBy: string; status: AgreementFilter; setStatus: (s: AgreementFilter) => void }) {
  const { t, money } = useFormat();
  const { can } = useAuth();
  const owner = can('dashboard.operational');
  const stats = useLoad(() => owner ? dashboard.installmentStats() : Promise.resolve(null), [owner]);
  const list = usePagedList<Agreement>(query => sales.installment(query, { soldBy, status }), { sort: 'createdAt:desc', fallback: 'Unable to load installment sales. Please try again.' }, [soldBy, status]);
  const exporter = useExport('installment', { ...(soldBy ? { soldBy } : {}), ...(status ? { status } : {}) });
  const s = stats.data;

  const header = (
    <View>
      {controls}
      <Alert text={list.error} />
      <Alert text={exporter.error} />
      {s ? (
        <MetricGrid>
          <Metric label="Outstanding" value={money(s.outstandingCents)} sub={s.activeAgreements === 1 ? t('1 active agreement') : t('{count} active agreements', { count: s.activeAgreements })} tone="violet" icon="hourglass-outline" />
          <Metric label="Overdue" value={money(s.overdueCents)} sub={s.overdueAgreements === 1 ? t('1 agreement') : t('{count} agreements', { count: s.overdueAgreements })} tone="red" icon="alert-circle-outline" alert={s.overdueAgreements > 0} />
          <Metric label="Collected" value={money(s.totalCollectedCents)} sub={t('Down payments {down} · installments {inst}', { down: money(s.downPaymentsCollectedCents), inst: money(s.installmentPaymentsCollectedCents) })} tone="green" icon="cash-outline" />
          <Metric label="Total sales value" value={money(s.totalSalesValueCents)} sub={t('{completed} completed · {cancelled} cancelled', { completed: s.completedAgreements, cancelled: s.cancelledAgreements })} tone="gold" icon="trending-up-outline" />
        </MetricGrid>
      ) : undefined}
      <Chips value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'ACTIVE', label: 'Active' }, { value: 'OVERDUE', label: 'Overdue', warn: true }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
      <SearchBar value={list.searchInput} onChange={list.setSearchInput} placeholder="Agreement number, product, serial, customer" />
      <View style={styles.countRow}>
        <Txt variant="small">{list.total === 1 ? t('1 agreement') : t('{count} agreements', { count: list.total })}</Txt>
        {can('reports.export') ? <Button title={t(exporter.exporting ? 'Exporting...' : 'Export CSV')} variant="ghost" small loading={exporter.exporting} onPress={() => void exporter.run()} /> : null}
      </View>
      {list.loading && !list.loaded ? <Loading /> : null}
    </View>
  );

  return (
    <FlatList
      data={list.items}
      keyExtractor={x => x._id}
      contentContainerStyle={screenStyles.listContent}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={() => { void list.refresh(); void stats.silentReload(); }} tintColor={colors.gold} />}
      onEndReachedThreshold={0.4}
      onEndReached={list.loadMore}
      renderItem={({ item }) => <AgreementRow agreement={item} />}
      ListEmptyComponent={list.loaded && !list.loading ? <EmptyState icon="calendar-outline" title={list.searchTerm || soldBy || status ? 'No matching agreements' : 'No installment sales yet'} text={list.searchTerm || soldBy || status ? 'Try a different search or filter.' : 'Find a unit in Inventory and use “Mark as sold”.'} /> : undefined}
      ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} loadingMore={list.loadingMore} hasMore={list.page < list.totalPages} onLoadMore={list.loadMore} />}
    />
  );
}

function HistoryList({ controls, soldBy }: { controls: React.ReactNode; soldBy: string }) {
  const { t } = useFormat();
  const [type, setType] = useState<'' | 'FULL_PRICE' | 'INSTALLMENT'>('');
  const list = usePagedList<Sale>(query => sales.history(query, { soldBy, type }), { sort: 'soldAt:desc', fallback: 'Unable to load sales. Please try again.' }, [soldBy, type]);

  const header = (
    <View>
      {controls}
      <Alert text={list.error} />
      <Chips value={type} onChange={setType} options={[{ value: '', label: 'All sales' }, { value: 'FULL_PRICE', label: 'Full price' }, { value: 'INSTALLMENT', label: 'Installment' }]} />
      <SearchBar value={list.searchInput} onChange={list.setSearchInput} placeholder="Sale number, product, serial, customer" />
      <Txt variant="small" style={styles.count}>{list.total === 1 ? t('1 sale') : t('{count} sales', { count: list.total })}</Txt>
      {list.loading && !list.loaded ? <Loading /> : null}
    </View>
  );

  return (
    <FlatList
      data={list.items}
      keyExtractor={x => x._id}
      contentContainerStyle={screenStyles.listContent}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.gold} />}
      onEndReachedThreshold={0.4}
      onEndReached={list.loadMore}
      renderItem={({ item }) => <SaleRow sale={item} />}
      ListEmptyComponent={list.loaded && !list.loading ? <EmptyState icon="time-outline" title={list.searchTerm || soldBy || type ? 'No matching sales' : 'No sales yet'} text={list.searchTerm || soldBy || type ? 'Try a different search or filter.' : 'Find a unit in Inventory and use “Mark as sold”.'} /> : undefined}
      ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} loadingMore={list.loadingMore} hasMore={list.page < list.totalPages} onLoadMore={list.loadMore} />}
    />
  );
}

const styles = StyleSheet.create({
  soldBy: { marginBottom: space.md },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  count: { marginBottom: space.sm },
  rowCard: { marginBottom: space.md, padding: 14 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rowBody: { flex: 1 },
  rowMeta: { marginTop: 6, gap: 2 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }
});
