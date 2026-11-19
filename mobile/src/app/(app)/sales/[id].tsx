import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { sales } from '@/api/endpoints';
import type { Sale } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { space } from '@/theme';
import { PAYMENT_METHOD_LABEL, SALE_STATUS_LABEL, SALE_STATUS_TONE, SALE_TYPE_LABEL, actorLabel } from '@/utils/labels';
import { sharePdf } from '@/utils/receipts';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { useConfirm } from '@/ui/dialogs';
import { Alert, Badge, Card, Fact, FactGrid, Loading } from '@/ui/primitives';

/** One sale (receipt view). The owner can cancel or refund it, with a reason. */
export default function SaleDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money, date } = useFormat();
  const { can } = useAuth();
  const confirm = useConfirm();
  const load = useLoad(() => sales.get(id), [id], 'Unable to load this sale.');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sharing, setSharing] = useState(false);
  const s = load.data?.sale;

  const shareReceipt = async (sale: Sale) => {
    setError('');
    setSharing(true);
    const problem = await sharePdf(() => sales.receiptPdf(sale._id), `receipt-${sale.saleNumber}.pdf`);
    setSharing(false);
    if (problem) setError(problem);
  };
  const agreement = load.data?.agreement;
  const [who, whoParams] = actorLabel(s?.soldBy);

  const correct = async (sale: Sale, action: 'cancel' | 'refund') => {
    const refund = action === 'refund';
    const answer = await confirm({
      title: refund ? 'Refund this sale?' : 'Cancel this sale?',
      message: refund
        ? 'Sale {number} will be marked as refunded and removed from sales totals. The unit is not returned to stock. This is recorded in the audit log.'
        : 'Sale {number} will be marked as cancelled and removed from sales totals. The unit is not returned to stock. This is recorded in the audit log.',
      messageParams: { number: sale.saleNumber },
      confirmLabel: refund ? 'Refund' : 'Cancel sale', danger: true, reasonLabel: 'Reason (required)'
    });
    if (!answer.confirmed) return;
    setError('');
    try {
      const res = await sales.correct(sale._id, action, answer.reason);
      load.setData(current => current ? { ...current, sale: res.sale, agreement: res.agreement } : current);
      setSuccess(refund ? 'Sale refunded.' : 'Sale cancelled.');
    } catch (e) {
      setError(errorMessage(e, 'Unable to update this sale. Please try again.'));
    }
  };

  return (
    <Screen back eyebrow="SALE" title={s?.saleNumber || '…'} rawTitle subtitle={s ? `${t(SALE_TYPE_LABEL[s.type])} · ${date(s.soldAt, 'medium')}` : undefined} rawSubtitle refreshing={load.refreshing} onRefresh={load.refresh}>
      <Alert text={load.error} />
      <Alert text={error} />
      <Alert kind="success" text={success} />
      {load.loading && !s ? <Loading /> : null}
      {s ? (
        <Card>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Txt variant="eyebrow">{t('PRODUCT')}</Txt>
              <Txt variant="h2">{s.item.productName}</Txt>
              <Txt variant="small">{s.item.brand} · {s.item.model} · <Txt variant="small" ltr>{s.item.serialNumber}</Txt></Txt>
            </View>
            <Badge label={SALE_STATUS_LABEL[s.status]} tone={SALE_STATUS_TONE[s.status]} big />
          </View>
          <FactGrid>
            <Fact label="LIST PRICE" value={money(s.item.listPriceCents)} />
            <Fact label={s.type === 'INSTALLMENT' ? 'INSTALLMENT PRICE' : 'SALE PRICE'} value={money(s.salePriceCents)} />
            {s.type === 'FULL_PRICE' ? <Fact label="DISCOUNT" value={money(s.discountCents)} /> : null}
            {s.item.purchasePriceCents !== undefined ? <Fact label="PURCHASE PRICE" value={s.item.purchasePriceCents === null ? t('Not recorded') : money(s.item.purchasePriceCents)} /> : null}
            <Fact label="SOLD BY" value={t(who, whoParams)} />
            <Fact label="PAYMENT" value={t(PAYMENT_METHOD_LABEL[s.paymentMethod])} />
            <Fact label="CUSTOMER" value={s.customer.name || t('Walk-in customer')} sub={s.customer.phone || undefined} />
            {s.legacy ? <Fact label="OLD RECORD" value={t('Imported from the old sales records')} sub={s.legacy.quantity > 1 ? t('Quantity: {count}', { count: s.legacy.quantity }) : undefined} /> : null}
            {agreement ? <Fact label="INSTALLMENT AGREEMENT" value={agreement.agreementNumber} ltr sub={t('{collected} collected · {balance} remaining', { collected: money(agreement.collectedCents), balance: money(agreement.balanceCents) })} /> : null}
          </FactGrid>
          {s.note ? <Txt variant="muted" style={styles.note}>{s.note}</Txt> : null}
          {s.cancellation ? (
            <Alert kind="warning" text={s.status === 'REFUNDED' ? 'Refunded on {date} by {name}: {reason}' : 'Cancelled on {date} by {name}: {reason}'}
              params={{ date: date(s.cancellation.at, 'medium'), name: t(...actorLabel(s.cancellation.by)), reason: s.cancellation.reason }} />
          ) : null}
          <View style={styles.actions}>
            <Button title={t(sharing ? 'Preparing PDF...' : s.type === 'INSTALLMENT' ? 'Share agreement (PDF)' : 'Share receipt (PDF)')} small loading={sharing} onPress={() => void shareReceipt(s)} />
          </View>
          <View style={styles.actions}>
            {s.customerId ? <Button title={t('View customer')} variant="outline" small onPress={() => router.push(`/customers/${s.customerId}`)} /> : null}
            {s.unitId ? <Button title={t('View unit')} variant="outline" small onPress={() => router.push(`/inventory/units/${s.unitId}`)} /> : null}
            {agreement ? <Button title={t('View agreement')} variant="outline" small onPress={() => router.push(`/sales/installments/${agreement._id}`)} /> : null}
          </View>
          {can('sales.correct') && s.status === 'COMPLETED' ? (
            <View style={styles.actions}>
              <Txt variant="label">{t('Corrections:')}</Txt>
              <Button title={t('Refund')} variant="outline" small onPress={() => void correct(s, 'refund')} />
              <Button title={t('Cancel sale')} variant="danger" small onPress={() => void correct(s, 'cancel')} />
            </View>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: space.lg },
  headerText: { flex: 1, gap: 2 },
  note: { marginBottom: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: space.sm }
});
