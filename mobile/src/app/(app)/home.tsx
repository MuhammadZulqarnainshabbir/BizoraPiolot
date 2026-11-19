import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { dashboard, inventory } from '@/api/endpoints';
import { useAuth, useSession } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { space } from '@/theme';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { Alert, Card, Loading, Metric, MetricGrid, QuickLink, SectionHeading } from '@/ui/primitives';

/** Home tab: the owner's shop overview or the employee's own summary. */
export default function HomeScreen() {
  const session = useSession();
  if (!session) return null;
  // Owners and managers get the shop-wide dashboard (the server leaves out cost figures unless allowed); employees their own summary.
  const manager = session.role === 'employee' && session.employee.accessRole === 'manager';
  return session.role === 'owner' || manager ? <ShopOverview /> : <EmployeeOverview />;
}

function ShopOverview() {
  const { t, money } = useFormat();
  const session = useSession();
  const { can } = useAuth();
  const seesTeam = can('employees.view');
  const summary = useLoad(() => dashboard.partnerSummary(), [], 'Unable to load your shop summary.');
  const team = useLoad(() => seesTeam ? dashboard.employeePerformance() : Promise.resolve([]), [seesTeam]);
  const s = summary.data;
  const owner = session?.role === 'owner';
  const name = session?.role === 'owner' ? session.shop.ownerName : session?.role === 'employee' ? session.employee.name : '';

  return (
    <Screen eyebrow={owner ? 'YOUR BUSINESS AT A GLANCE' : 'SHOP DASHBOARD'} title="Good to see you, {name}" titleParams={{ name: name || t('there') }} subtitle={owner ? 'Here’s what’s happening with your shop today.' : 'Here’s what’s happening with the shop today.'} refreshing={summary.refreshing} onRefresh={() => { void summary.refresh(); void team.silentReload(); }}>
      <Alert text={summary.error} />
      {summary.loading && !s ? <Loading /> : null}

      {s ? (
        <>
          {s.stock.needsSerial ? (
            <Alert kind="warning" text={s.stock.needsSerial === 1 ? '1 unit from your old stock records needs its real serial number before it can be sold.' : '{count} units from your old stock records need their real serial numbers before they can be sold.'} params={{ count: s.stock.needsSerial }} />
          ) : null}
          <MetricGrid>
            <Metric label="Total product units" value={String(s.stock.total)} sub={t('Show every unit')} icon="cube-outline" tone="violet" onPress={() => router.push('/inventory')} />
            <Metric label="Available units" value={String(s.stock.available)} sub={t('Worth {amount} at selling price', { amount: money(s.stock.availableSellingValueCents) })} icon="checkmark-circle-outline" tone="green" onPress={() => router.push({ pathname: '/inventory', params: { status: 'AVAILABLE' } })} />
            <Metric label="Sold at full price" value={String(s.stock.soldFullPrice)} sub={t('units')} icon="pricetag-outline" tone="blue" onPress={() => router.push({ pathname: '/inventory', params: { status: 'SOLD_FULL_PRICE' } })} />
            <Metric label="Sold on installment" value={String(s.stock.soldInstallment)} sub={t('units')} icon="calendar-outline" tone="blue" onPress={() => router.push({ pathname: '/inventory', params: { status: 'SOLD_INSTALLMENT' } })} />
            <Metric label="Total sales value" value={money(s.sales.totalValueCents)} sub={`${t('Today: {amount}', { amount: money(s.sales.todayValueCents) })} · ${t('This month: {amount}', { amount: money(s.sales.monthValueCents) })}`} icon="trending-up-outline" tone="green" onPress={() => router.push({ pathname: '/sales', params: { tab: 'history' } })} />
            <Metric label="Full-price revenue" value={money(s.sales.fullPriceRevenueCents)} sub={t('Total collected: {amount}', { amount: money(s.collected.totalCents) })} icon="cash-outline" tone="green" onPress={() => router.push({ pathname: '/sales', params: { tab: 'full-price' } })} />
            <Metric label="Installment outstanding" value={money(s.installments.outstandingCents)} sub={s.installments.active === 1 ? t('1 active agreement') : t('{count} active agreements', { count: s.installments.active })} icon="hourglass-outline" tone="violet" onPress={() => router.push({ pathname: '/sales', params: { tab: 'installments' } })} />
            <Metric label="Overdue installments" value={money(s.installments.overdueCents)} sub={s.installments.overdue === 1 ? t('1 agreement') : t('{count} agreements', { count: s.installments.overdue })} icon="alert-circle-outline" tone="red" alert={s.installments.overdue > 0} onPress={() => router.push({ pathname: '/sales', params: { tab: 'installments', status: 'OVERDUE' } })} />
          </MetricGrid>
        </>
      ) : null}

      {seesTeam ? <Card>
        <SectionHeading title="Team performance" text="Stock added and sales made by each person." right={can('employees.manage') ? <Button title={t('Employees')} variant="ghost" small onPress={() => router.push('/account/employees')} /> : undefined} />
        {team.data?.length ? team.data.map((e, i) => (
          <View key={e.id} style={[styles.teamRow, i === team.data!.length - 1 && styles.teamRowLast]}>
            <View style={styles.teamName}>
              <Txt bold>{e.type === 'owner' ? t('Shop owner') : e.name}</Txt>
              {e.employeeId ? <Txt variant="small" ltr>{e.employeeId}</Txt> : null}
            </View>
            <View style={styles.teamStats}>
              <Txt variant="small">{t('UNITS ADDED')}: {e.unitsAdded} · {t('FULL PRICE')}: {e.fullPriceCount} · {t('INSTALLMENT')}: {e.installmentCount}</Txt>
              <Txt bold>{money(e.totalSalesCents)}</Txt>
            </View>
          </View>
        )) : team.loading ? <Loading /> : <Txt variant="small">{t('No activity yet.')}</Txt>}
      </Card> : null}

      <Card>
        <SectionHeading title="Shop management" text="Everything you need, in one place." />
        <QuickLink icon="add-circle-outline" title="Add stock" text="New units with serial numbers" tone="blue" onPress={() => router.push('/inventory/add')} />
        <QuickLink icon="cube-outline" title="Inventory" text="Every unit and its status" tone="blue" onPress={() => router.push('/inventory')} />
        <QuickLink icon="trending-up-outline" title="Full-price sales" text="Totals by day, week and month" tone="green" onPress={() => router.push({ pathname: '/sales', params: { tab: 'full-price' } })} />
        <QuickLink icon="calendar-outline" title="Installment sales" text="Payments and balances" tone="green" onPress={() => router.push({ pathname: '/sales', params: { tab: 'installments' } })} />
        <QuickLink icon="person-outline" title="Customers" text={s?.customers?.total ? t('{count} on record · CNIC pictures and purchase history', { count: s.customers.total }) : 'Details, CNIC pictures and purchase history'} tone="violet" onPress={() => router.push('/customers')} />
        {can('employees.manage') ? <QuickLink icon="people-outline" title="Employees" text="Accounts and login link" tone="violet" onPress={() => router.push('/account/employees')} /> : null}
      </Card>
    </Screen>
  );
}

function EmployeeOverview() {
  const { t, money } = useFormat();
  const session = useSession();
  const { can } = useAuth();
  const summary = useLoad(() => dashboard.employeeSummary(), [], 'Unable to load your summary.');
  const stock = useLoad(() => inventory.stockSummary(), []);
  const s = summary.data;
  const name = session?.role === 'employee' ? session.employee.name : '';

  return (
    <Screen eyebrow="MY SUMMARY" title="Hello, {name}" titleParams={{ name: name || t('there') }} subtitle="Your sales and the shop’s stock today." refreshing={summary.refreshing} onRefresh={() => { void summary.refresh(); void stock.silentReload(); }}
      right={can('inventory.add') ? <Button title={t('＋ Add stock')} small onPress={() => router.push('/inventory/add')} /> : undefined}>
      <Alert text={summary.error} />
      {summary.loading && !s ? <Loading /> : null}
      {s ? (
        <MetricGrid>
          <Metric label="My sales today" value={money(s.todaySalesCents)} sub={s.todayCount === 1 ? t('1 sale') : t('{count} sales', { count: s.todayCount })} icon="trending-up-outline" tone="green" />
          <Metric label="My sales this month" value={money(s.monthSalesCents)} sub={s.monthCount === 1 ? t('1 sale') : t('{count} sales', { count: s.monthCount })} icon="trending-up-outline" tone="green" />
          <Metric label="Sold at full price" value={String(s.fullPriceCount)} sub={t('units, all time')} icon="pricetag-outline" tone="blue" onPress={() => router.push({ pathname: '/sales', params: { tab: 'full-price' } })} />
          <Metric label="Sold on installment" value={String(s.installmentCount)} sub={t('{active} active · {overdue} overdue', { active: s.installments.active, overdue: s.installments.overdue })} icon="calendar-outline" tone="violet" onPress={() => router.push({ pathname: '/sales', params: { tab: 'installments' } })} />
          <Metric label="My total sales" value={money(s.totalSalesCents)} sub={t('Outstanding on my installments: {amount}', { amount: money(s.installments.outstandingCents) })} icon="cash-outline" tone="green" />
          <Metric label="Units I added" value={String(s.unitsAdded)} sub={t('all time')} icon="cube-outline" tone="violet" onPress={() => router.push({ pathname: '/inventory', params: { addedBy: 'me' } })} />
          {stock.data ? <Metric label="Available in shop" value={String(stock.data.available)} sub={t('units ready to sell')} icon="checkmark-circle-outline" tone="blue" onPress={() => router.push({ pathname: '/inventory', params: { status: 'AVAILABLE' } })} /> : null}
        </MetricGrid>
      ) : null}
      <Card>
        <SectionHeading title="Quick actions" text="Find a unit, then use “Mark as sold”." />
        <QuickLink icon="cube-outline" title="Inventory" text="Find a unit by serial number and sell it" tone="blue" onPress={() => router.push('/inventory')} />
        <QuickLink icon="add-circle-outline" title="Add stock" text="New units with serial numbers" tone="blue" onPress={() => router.push('/inventory/add')} />
        <QuickLink icon="trending-up-outline" title="My full-price sales" text="Units you sold at full price" tone="green" onPress={() => router.push({ pathname: '/sales', params: { tab: 'full-price' } })} />
        <QuickLink icon="calendar-outline" title="My installment sales" text="Balances and due dates" tone="green" onPress={() => router.push({ pathname: '/sales', params: { tab: 'installments' } })} />
        <QuickLink icon="person-outline" title="Customers" text="Details, CNIC pictures and purchase history" tone="violet" onPress={() => router.push('/customers')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  teamRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5DDD0', gap: 2 },
  teamRowLast: { borderBottomWidth: 0 },
  teamName: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  teamStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }
});
