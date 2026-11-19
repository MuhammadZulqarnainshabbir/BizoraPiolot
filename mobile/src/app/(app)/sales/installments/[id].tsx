import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { installments, sales } from '@/api/endpoints';
import { PAYMENT_METHODS, type Agreement, type PaymentMethod } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { colors, space } from '@/theme';
import { isMoney, toCents } from '@/utils/forms';
import { AGREEMENT_STATUS_LABEL, AGREEMENT_STATUS_TONE, FREQUENCY_LABEL, INSTALLMENT_STATE_LABEL, INSTALLMENT_STATE_TONE, PAYMENT_METHOD_LABEL, actorLabel } from '@/utils/labels';
import { sharePdf } from '@/utils/receipts';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { useConfirm } from '@/ui/dialogs';
import { Alert, Badge, Card, Fact, FactGrid, Loading, SectionHeading } from '@/ui/primitives';

/** One installment agreement: schedule, payments, and (owner) record a payment or cancel. */
export default function AgreementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, money, date } = useFormat();
  const { can } = useAuth();
  const confirm = useConfirm();
  const isOwner = can('installments.recordPayment');
  const load = useLoad(() => installments.get(id), [id], 'Unable to load this agreement.');
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  /** 'agreement' or a payment id while its PDF is being prepared. */
  const [sharing, setSharing] = useState<string | null>(null);

  const a = load.data?.agreement;

  const shareAgreement = async (agreement: Agreement) => {
    setError('');
    setSharing('agreement');
    const problem = await sharePdf(() => sales.receiptPdf(agreement.saleId), `receipt-${agreement.agreementNumber}.pdf`);
    setSharing(null);
    if (problem) setError(problem);
  };

  const sharePayment = async (agreement: Agreement, paymentId: string) => {
    setError('');
    setSharing(paymentId);
    const problem = await sharePdf(() => installments.paymentReceiptPdf(agreement._id, paymentId), `payment-${agreement.agreementNumber}.pdf`);
    setSharing(null);
    if (problem) setError(problem);
  };
  const sale = load.data?.sale;
  const payments = load.data?.payments ?? [];
  const overpaying = Boolean(a) && toCents(amount) > (a?.balanceCents ?? 0);
  const amountError = touched && !isMoney(amount, { allowZero: false }) ? 'Enter an amount greater than zero, with at most 2 decimals.' : overpaying ? 'The amount is more than the remaining balance.' : '';

  const openPayment = (agreement: Agreement) => {
    setSuccess('');
    setAmount(String((agreement.nextDueCents ?? agreement.balanceCents) / 100));
    setMethod('CASH');
    setNote('');
    setTouched(false);
    setPaying(true);
  };

  const pay = async (agreement: Agreement) => {
    setTouched(true);
    if (!isMoney(amount, { allowZero: false }) || overpaying || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await installments.recordPayment(agreement._id, { amount: Number(amount), method, note: note.trim() });
      load.setData(current => current ? { ...current, agreement: res.agreement, payments: res.payments } : current);
      setPaying(false);
      setSuccess(res.agreement.status === 'COMPLETED' ? 'Payment saved. This agreement is now fully paid.' : 'Payment saved.');
    } catch (e) {
      setError(errorMessage(e, 'Unable to save the payment. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (agreement: Agreement) => {
    const answer = await confirm({
      title: 'Cancel this agreement?',
      message: 'Agreement {number} for {customer} will be cancelled and no more payments can be recorded. The unit is not returned to stock. This is recorded in the audit log.',
      messageParams: { number: agreement.agreementNumber, customer: agreement.customer.name },
      confirmLabel: 'Cancel agreement', danger: true, reasonLabel: 'Reason (required)'
    });
    if (!answer.confirmed) return;
    setError('');
    try {
      await sales.correct(agreement.saleId, 'cancel', answer.reason);
      setSuccess('Agreement cancelled.');
      void load.silentReload();
    } catch (e) {
      setError(errorMessage(e, 'Unable to cancel. Please try again.'));
    }
  };

  const [seller, sellerParams] = actorLabel(a?.soldBy);

  return (
    <Screen back eyebrow="INSTALLMENT AGREEMENT" title={a?.agreementNumber || '…'} rawTitle subtitle={a ? `${a.item.productName} · ${a.item.serialNumber}` : undefined} rawSubtitle refreshing={load.refreshing} onRefresh={load.refresh}>
      <Alert text={load.error} />
      <Alert text={error} />
      <Alert kind="success" text={success} />
      {load.loading && !a ? <Loading /> : null}
      {a ? (
        <>
          <Card>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Txt variant="eyebrow">{t('CUSTOMER')}</Txt>
                <Txt variant="h2">{a.customer.name}</Txt>
                <Txt variant="small">{[a.customer.phone, a.customer.address, a.customer.reference].filter(Boolean).join(' · ')}</Txt>
              </View>
              <Badge label={AGREEMENT_STATUS_LABEL[a.displayStatus]} tone={AGREEMENT_STATUS_TONE[a.displayStatus]} big />
            </View>
            <FactGrid>
              <Fact label="TOTAL PRICE" value={money(a.totalPriceCents)} />
              <Fact label="DOWN PAYMENT" value={money(a.downPaymentCents)} />
              <Fact label="COLLECTED" value={money(a.collectedCents)} sub={t('including down payment')} />
              <Fact label="REMAINING BALANCE" value={money(a.balanceCents)} sub={a.overdueCents ? t('{amount} overdue', { amount: money(a.overdueCents) }) : undefined} />
              <Fact label="PLAN" value={`${a.installmentCount} × ${t(FREQUENCY_LABEL[a.frequency])}`} sub={a.frequency === 'CUSTOM' ? t('every {count} days', { count: a.intervalDays }) : undefined} />
              <Fact label="NEXT DUE" value={a.nextDueDate ? date(a.nextDueDate) : '—'} sub={a.nextDueCents ? money(a.nextDueCents) : undefined} />
              <Fact label="SOLD BY" value={t(seller, sellerParams)} sub={date(a.createdAt, 'medium')} />
              {sale ? <Fact label="SALE" value={sale.saleNumber} ltr /> : null}
            </FactGrid>
            {a.notes ? <Txt variant="muted" style={styles.notes}>{a.notes}</Txt> : null}
            {a.cancellation ? <Alert kind="warning" text="Cancelled on {date} by {name}: {reason}" params={{ date: date(a.cancellation.at, 'medium'), name: t(...actorLabel(a.cancellation.by)), reason: a.cancellation.reason }} /> : null}
            <View style={styles.actions}>
              <Button title={t(sharing === 'agreement' ? 'Preparing PDF...' : 'Share agreement (PDF)')} small loading={sharing === 'agreement'} onPress={() => void shareAgreement(a)} />
            </View>
            <View style={styles.actions}>
              {a.customerId ? <Button title={t('View customer')} variant="outline" small onPress={() => router.push(`/customers/${a.customerId}`)} /> : null}
              {sale ? <Button title={t('View sale')} variant="outline" small onPress={() => router.push(`/sales/${sale._id}`)} /> : null}
              {a.unitId ? <Button title={t('View unit')} variant="outline" small onPress={() => router.push(`/inventory/units/${a.unitId}`)} /> : null}
            </View>
            {isOwner && a.status !== 'CANCELLED' && sale?.status === 'COMPLETED' ? (
              <View style={styles.actions}>
                {a.status === 'ACTIVE' ? <Button title={t('Record payment')} small onPress={() => openPayment(a)} /> : null}
                <Button title={t('Cancel agreement')} variant="danger" small onPress={() => void cancel(a)} />
              </View>
            ) : null}
            {!isOwner && a.status === 'ACTIVE' ? <Txt variant="small" style={styles.hint}>{t('Payments are recorded by the shop owner.')}</Txt> : null}
          </Card>

          {paying ? (
            <Card>
              <SectionHeading title="Record payment" text={t('Remaining balance: {amount}', { amount: money(a.balanceCents) })} />
              <Field label="Amount (Rs)" value={amount} onChangeText={setAmount} error={amountError} ltr keyboardType="decimal-pad" />
              <Select label="Payment method" value={method} onChange={setMethod} options={PAYMENT_METHODS.map(m => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} />
              <Field label="Note" optional value={note} onChangeText={setNote} maxLength={300} />
              <View style={styles.formActions}>
                <Button title={t('Cancel')} variant="outline" small onPress={() => setPaying(false)} />
                <Button title={t(saving ? 'Saving...' : 'Save payment')} small loading={saving} onPress={() => void pay(a)} />
              </View>
            </Card>
          ) : null}

          <Card>
            <SectionHeading title="Payment schedule" />
            {a.schedule.map((e, i) => (
              <View key={e.number} style={[styles.scheduleRow, i === a.schedule.length - 1 && styles.last]}>
                <Txt variant="small" style={styles.colNum}>{e.number}</Txt>
                <View style={styles.colMain}>
                  <Txt variant="small" bold>{date(e.dueDate)}</Txt>
                  <Txt variant="small">{t('AMOUNT')}: {money(e.amountCents)} · {t('PAID')}: {money(e.paidCents)}</Txt>
                </View>
                <Badge label={INSTALLMENT_STATE_LABEL[e.state]} tone={INSTALLMENT_STATE_TONE[e.state]} />
              </View>
            ))}
          </Card>

          <Card>
            <SectionHeading title="Payments received" />
            {payments.length ? payments.map((p, i) => (
              <View key={p._id} style={[styles.paymentRow, i === payments.length - 1 && styles.last]}>
                <View style={styles.colMain}>
                  <Txt bold>{money(p.amountCents)} · {t(p.kind === 'DOWN_PAYMENT' ? 'Down payment' : 'Installment')}</Txt>
                  <Txt variant="small">{date(p.paidAt, 'medium')} · {t(PAYMENT_METHOD_LABEL[p.method])} · {t(...actorLabel(p.recordedBy))}</Txt>
                  {p.note ? <Txt variant="small">{p.note}</Txt> : null}
                </View>
                <Button title={t(sharing === p._id ? 'Preparing...' : 'PDF')} variant="outline" small loading={sharing === p._id} onPress={() => void sharePayment(a, p._id)} />
              </View>
            )) : <Txt variant="small">{t('No payments yet.')}</Txt>}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: space.lg },
  headerText: { flex: 1, gap: 2 },
  notes: { marginBottom: space.md },
  hint: { marginTop: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: space.sm },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  last: { borderBottomWidth: 0 },
  colNum: { width: 24 },
  colMain: { flex: 1, gap: 2 }
});
