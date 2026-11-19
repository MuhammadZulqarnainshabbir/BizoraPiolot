import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { inventory, sales } from '@/api/endpoints';
import { FREQUENCIES, PAYMENT_METHODS, type Agreement, type CustomerRecord, type Frequency, type PaymentMethod } from '@/api/models';
import { CustomerPicker } from '@/ui/CustomerPicker';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { colors, space } from '@/theme';
import { addDays, addMonths, isYmd, previewSchedule, todayIn } from '@/utils/dates';
import { isMoney, toCents } from '@/utils/forms';
import { FREQUENCY_LABEL, PAYMENT_METHOD_LABEL } from '@/utils/labels';
import { sharePdf } from '@/utils/receipts';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { Alert, Card, Fact, FactGrid, Loading, SectionHeading } from '@/ui/primitives';

/** "Sold on installment": creates the sale and its installment agreement in one step. */
export default function InstallmentSaleScreen() {
  const { unitId } = useLocalSearchParams<{ unitId: string }>();
  const { t, money, date, timezone } = useFormat();
  const today = useMemo(() => todayIn(timezone), [timezone]);
  const load = useLoad(() => inventory.unit(unitId), [unitId], 'Unable to load this unit.');

  const [customer, setCustomer] = useState({ name: '', phone: '', address: '', reference: '' });
  const [record, setRecord] = useState<CustomerRecord | null>(null);
  const pickCustomer = (c: CustomerRecord | null) => {
    setRecord(c);
    if (c) setCustomer({ name: c.name, phone: c.phone, address: c.address, reference: c.cnicFormatted });
  };
  const [totalPrice, setTotalPrice] = useState('');
  const [downPayment, setDownPayment] = useState('0');
  const [count, setCount] = useState('6');
  const [frequency, setFrequency] = useState<Frequency>('MONTHLY');
  const [intervalDays, setIntervalDays] = useState('30');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Agreement | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const share = async (agreement: Agreement) => {
    setShareError('');
    setSharing(true);
    setShareError(await sharePdf(() => sales.receiptPdf(agreement.saleId), `receipt-${agreement.agreementNumber}.pdf`));
    setSharing(false);
  };

  const u = load.data?.unit;
  useEffect(() => { if (u && totalPrice === '' && !touched) setTotalPrice(String(u.sellingPriceCents / 100)); }, [u, totalPrice, touched]);

  const totalCents = toCents(totalPrice);
  const downCents = toCents(downPayment);
  const financedCents = Math.max(0, totalCents - downCents);
  const downTooHigh = totalCents > 0 && downCents >= totalCents;
  const countNumber = Number(count);
  const countValid = /^\d+$/.test(count.trim()) && countNumber >= 1 && countNumber <= 120;
  const interval = Number(intervalDays) || 30;
  const intervalValid = frequency !== 'CUSTOM' || (/^\d+$/.test(intervalDays.trim()) && interval >= 1 && interval <= 365);
  const dateValid = !firstDueDate.trim() || (isYmd(firstDueDate.trim()) && firstDueDate.trim() >= today && firstDueDate.trim() <= addMonths(today, 12));
  const schedule = useMemo(() => {
    const first = firstDueDate.trim() && isYmd(firstDueDate.trim()) ? firstDueDate.trim() : frequency === 'MONTHLY' ? addMonths(today, 1) : addDays(today, frequency === 'WEEKLY' ? 7 : interval);
    return countValid && !downTooHigh ? previewSchedule(financedCents, countNumber, frequency, first, interval) : [];
  }, [firstDueDate, frequency, today, interval, countValid, downTooHigh, financedCents, countNumber]);

  const errors = {
    name: touched && !customer.name.trim() ? 'Enter the customer’s name.' : '',
    phone: touched && !customer.phone.trim() ? 'Enter the customer’s phone number.' : '',
    total: touched && !isMoney(totalPrice, { allowZero: false }) ? 'Enter an amount greater than zero, with at most 2 decimals.' : '',
    down: touched && !isMoney(downPayment) ? 'Enter an amount of zero or more, with at most 2 decimals.' : downTooHigh ? 'Down payment must be less than the total. Use a full-price sale instead.' : '',
    count: touched && !countValid ? 'Use a whole number from 1 to 120.' : '',
    interval: touched && !intervalValid ? 'Use a whole number from 1 to 365.' : '',
    date: touched && !dateValid ? 'First due date must be between today and one year from now (YYYY-MM-DD).' : ''
  };
  const valid = customer.name.trim() && customer.phone.trim() && isMoney(totalPrice, { allowZero: false }) && isMoney(downPayment) && !downTooHigh && countValid && intervalValid && dateValid;

  const submit = async () => {
    if (!u) return;
    setTouched(true);
    if (!valid || saving) { setError('Check the highlighted fields.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await sales.sellInstallment({
        unitId: u._id, totalPrice: Number(totalPrice), downPayment: Number(downPayment), installmentCount: countNumber,
        frequency, ...(frequency === 'CUSTOM' ? { intervalDays: interval } : {}),
        ...(firstDueDate.trim() ? { firstDueDate: firstDueDate.trim() } : {}), paymentMethod: method,
        ...(record ? { customerId: record._id } : { customer: { name: customer.name.trim(), phone: customer.phone.trim(), address: customer.address.trim(), reference: customer.reference.trim() } }),
        notes: notes.trim()
      });
      setCreated(res.agreement);
    } catch (e) {
      setError(errorMessage(e, 'Unable to record sale.'));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <Screen back eyebrow="MARK AS SOLD" title="Installment agreement {number} created." titleParams={{ number: created.agreementNumber }}>
        <Card>
          <Alert kind="success" text="{product} ({serial}) for {customer}: {balance} remaining over {count} installments." params={{ product: created.item.productName, serial: created.item.serialNumber, customer: created.customer.name, balance: money(created.balanceCents), count: created.installmentCount }} />
          <Alert text={shareError} />
          <Button title={t(sharing ? 'Preparing PDF...' : 'Share agreement (PDF)')} full loading={sharing} onPress={() => void share(created)} style={styles.share} />
          <View style={styles.actions}>
            <Button title={t('View agreement')} variant="outline" onPress={() => router.replace(`/sales/installments/${created._id}`)} />
            <Button title={t('Back to inventory')} onPress={() => router.dismissTo('/inventory')} />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back eyebrow="MARK AS SOLD" title="Sell on installment" subtitle="The schedule is calculated for you. The sale time, your name and the shop are recorded automatically.">
      <Alert text={load.error} />
      <Alert text={error} />
      {load.loading && !u ? <Loading /> : null}
      {u && (u.status !== 'AVAILABLE' || u.serialPending) ? <Alert text={u.serialPending ? 'Enter this unit’s real serial number before selling it' : 'This unit has already been sold'} /> : null}
      {u && u.status === 'AVAILABLE' && !u.serialPending ? (
        <>
          <Card>
            <FactGrid>
              <Fact label="PRODUCT" value={u.productName} sub={`${u.brand} · ${u.model}`} />
              <Fact label="SERIAL NUMBER" value={u.serialNumber} ltr />
              <Fact label="SELLING PRICE" value={money(u.sellingPriceCents)} />
            </FactGrid>
          </Card>
          <Card>
            <SectionHeading title="Customer" />
            <CustomerPicker value={record} onChange={pickCustomer} />
            <Field label="Customer name" value={customer.name} onChangeText={v => setCustomer(c => ({ ...c, name: v }))} error={errors.name} maxLength={120} editable={!record} />
            <Field label="Customer phone" value={customer.phone} onChangeText={v => setCustomer(c => ({ ...c, phone: v }))} error={errors.phone} ltr keyboardType="phone-pad" maxLength={40} editable={!record} />
            <Field label="Address" optional value={customer.address} onChangeText={v => setCustomer(c => ({ ...c, address: v }))} maxLength={300} editable={!record} />
            <Field label="CNIC / reference" optional="Optional · a 13-digit CNIC is saved on the customer record" value={customer.reference} onChangeText={v => setCustomer(c => ({ ...c, reference: v }))} ltr maxLength={60} autoCapitalize="none" placeholder="12345-1234567-1" editable={!record} />
            {record ? <Txt variant="small">{t('Linked to customer {code}. Edit their record to change these details.', { code: record.customerCode })}</Txt> : null}
          </Card>
          <Card>
            <SectionHeading title="Installment plan" />
            <Field label="Total installment price (Rs)" value={totalPrice} onChangeText={v => { setTouched(true); setTotalPrice(v); }} error={errors.total} ltr keyboardType="decimal-pad" />
            <Field label="Down payment (Rs)" value={downPayment} onChangeText={setDownPayment} error={errors.down} ltr keyboardType="decimal-pad" />
            <Field label="Number of installments" value={count} onChangeText={setCount} error={errors.count} ltr keyboardType="number-pad" />
            <Select label="Frequency" value={frequency} onChange={setFrequency} options={FREQUENCIES.map(f => ({ value: f, label: FREQUENCY_LABEL[f] }))} />
            {frequency === 'CUSTOM' ? <Field label="Days between installments" value={intervalDays} onChangeText={setIntervalDays} error={errors.interval} ltr keyboardType="number-pad" /> : null}
            <Field label="First due date" optional value={firstDueDate} onChangeText={setFirstDueDate} error={errors.date} ltr placeholder={addMonths(today, 1)} hint="YYYY-MM-DD. Leave empty for one period from today." autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            <Select label="Down payment method" value={method} onChange={setMethod} options={PAYMENT_METHODS.map(m => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} />
            <Field label="Notes" optional value={notes} onChangeText={setNotes} maxLength={500} />
          </Card>
          <Card tone="cream">
            <FactGrid>
              <Fact label="Total" value={money(totalCents)} />
              <Fact label="Down payment" value={money(downCents)} />
              <Fact label="Remaining balance" value={money(financedCents)} />
              {schedule.length ? <Fact label="Installment amount" value={`${money(schedule[0].amountCents)} × ${schedule.length}`} sub={schedule[schedule.length - 1].amountCents !== schedule[0].amountCents ? t('last payment {amount}', { amount: money(schedule[schedule.length - 1].amountCents) }) : undefined} /> : null}
            </FactGrid>
            {schedule.length ? (
              <View>
                <View style={styles.scheduleHead}>
                  <Txt variant="small" bold style={styles.colNum}>#</Txt>
                  <Txt variant="small" bold style={styles.colDate}>{t('DUE DATE')}</Txt>
                  <Txt variant="small" bold style={styles.colAmount}>{t('AMOUNT')}</Txt>
                </View>
                {schedule.slice(0, 12).map(e => (
                  <View key={e.number} style={styles.scheduleRow}>
                    <Txt variant="small" style={styles.colNum}>{e.number}</Txt>
                    <Txt variant="small" style={styles.colDate}>{date(e.dueDate)}</Txt>
                    <Txt variant="small" style={styles.colAmount}>{money(e.amountCents)}</Txt>
                  </View>
                ))}
                {schedule.length > 12 ? <Txt variant="small" style={styles.more}>{t('…and {count} more', { count: schedule.length - 12 })}</Txt> : null}
              </View>
            ) : null}
          </Card>
          <View style={styles.actions}>
            <Button title={t('Cancel')} variant="outline" onPress={() => router.back()} />
            <Button title={t(saving ? 'Recording...' : 'Record installment sale')} loading={saving} onPress={submit} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: space.sm, marginBottom: space.xl },
  share: { marginBottom: space.md },
  scheduleHead: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  scheduleRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  colNum: { width: 28 },
  colDate: { flex: 1.4 },
  colAmount: { flex: 1, textAlign: 'right' },
  more: { marginTop: 6 }
});
