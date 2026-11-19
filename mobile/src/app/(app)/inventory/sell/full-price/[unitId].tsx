import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { inventory, sales } from '@/api/endpoints';
import { PAYMENT_METHODS, type CustomerRecord, type PaymentMethod, type Sale } from '@/api/models';
import { CustomerPicker } from '@/ui/CustomerPicker';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { space } from '@/theme';
import { isMoney, toCents } from '@/utils/forms';
import { PAYMENT_METHOD_LABEL } from '@/utils/labels';
import { sharePdf } from '@/utils/receipts';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Select } from '@/ui/Select';
import { Alert, Card, Fact, FactGrid, Loading } from '@/ui/primitives';

/** "Sold at full price": records the sale; the server marks the unit SOLD_FULL_PRICE. */
export default function FullPriceSaleScreen() {
  const { unitId } = useLocalSearchParams<{ unitId: string }>();
  const { t, money } = useFormat();
  const load = useLoad(() => inventory.unit(unitId), [unitId], 'Unable to load this unit.');
  const [salePrice, setSalePrice] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const pickCustomer = (c: CustomerRecord | null) => {
    setCustomer(c);
    if (c) { setCustomerName(c.name); setCustomerPhone(c.phone); }
  };
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sold, setSold] = useState<Sale | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const share = async (sale: Sale) => {
    setShareError('');
    setSharing(true);
    setShareError(await sharePdf(() => sales.receiptPdf(sale._id), `receipt-${sale.saleNumber}.pdf`));
    setSharing(false);
  };

  const u = load.data?.unit;
  useEffect(() => { if (u && !touched && salePrice === '') setSalePrice(String(u.sellingPriceCents / 100)); }, [u, touched, salePrice]);
  const discountCents = Math.max(0, (u?.sellingPriceCents ?? 0) - toCents(salePrice));
  const priceError = touched && !isMoney(salePrice) ? 'Enter an amount of zero or more, with at most 2 decimals.' : '';

  const submit = async () => {
    if (!u) return;
    setTouched(true);
    if (!isMoney(salePrice) || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await sales.sellFullPrice({
        unitId: u._id, salePrice: Number(salePrice), paymentMethod: method,
        ...(customer ? { customerId: customer._id } : { customer: { name: customerName.trim(), phone: customerPhone.trim() } }), note: note.trim()
      });
      setSold(res.sale);
    } catch (e) {
      setError(errorMessage(e, 'Unable to record sale.'));
    } finally {
      setSaving(false);
    }
  };

  if (sold) {
    return (
      <Screen back eyebrow="MARK AS SOLD" title="Sale {number} recorded." titleParams={{ number: sold.saleNumber }}>
        <Card>
          <Alert kind="success" text="{product} ({serial}) sold for {price}." params={{ product: sold.item.productName, serial: sold.item.serialNumber, price: money(sold.salePriceCents) }} />
          <Alert text={shareError} />
          <Button title={t(sharing ? 'Preparing PDF...' : 'Share receipt (PDF)')} full loading={sharing} onPress={() => void share(sold)} style={styles.share} />
          <View style={styles.actions}>
            <Button title={t('View sale')} variant="outline" onPress={() => router.replace(`/sales/${sold._id}`)} />
            <Button title={t('Back to inventory')} onPress={() => router.dismissTo('/inventory')} />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back eyebrow="MARK AS SOLD" title="Sell at full price" subtitle="The sale time, your name and the shop are recorded automatically.">
      <Alert text={load.error} />
      <Alert text={error} />
      {load.loading && !u ? <Loading /> : null}
      {u && (u.status !== 'AVAILABLE' || u.serialPending) ? <Alert text={u.serialPending ? 'Enter this unit’s real serial number before selling it' : 'This unit has already been sold'} /> : null}
      {u && u.status === 'AVAILABLE' && !u.serialPending ? (
        <Card>
          <FactGrid>
            <Fact label="PRODUCT" value={u.productName} sub={`${u.brand} · ${u.model}`} />
            <Fact label="SERIAL NUMBER" value={u.serialNumber} ltr />
            <Fact label="SELLING PRICE" value={money(u.sellingPriceCents)} />
            <Fact label="DISCOUNT" value={money(discountCents)} />
          </FactGrid>
          <Field label="Actual sale price (Rs)" value={salePrice} onChangeText={v => { setTouched(true); setSalePrice(v); }} error={priceError} ltr keyboardType="decimal-pad" />
          <Select label="Payment method" value={method} onChange={setMethod} options={PAYMENT_METHODS.map(m => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} />
          <CustomerPicker value={customer} onChange={pickCustomer} />
          <Field label="Customer name" optional value={customerName} onChangeText={setCustomerName} maxLength={120} editable={!customer} />
          <Field label="Customer phone" optional value={customerPhone} onChangeText={setCustomerPhone} ltr keyboardType="phone-pad" maxLength={40} editable={!customer} />
          <Field label="Note" optional value={note} onChangeText={setNote} maxLength={500} />
          <View style={styles.actions}>
            <Button title={t('Cancel')} variant="outline" onPress={() => router.back()} />
            <Button title={t(saving ? 'Recording...' : 'Record full-price sale')} loading={saving} onPress={submit} />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: space.sm },
  share: { marginBottom: space.md }
});
