import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { inventory } from '@/api/endpoints';
import type { InventoryUnit } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { space } from '@/theme';
import { isMoney } from '@/utils/forms';
import { SALE_TYPE_LABEL, UNIT_STATUS_LABEL, UNIT_STATUS_TONE, actorLabel } from '@/utils/labels';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { useConfirm } from '@/ui/dialogs';
import { Alert, Badge, Card, Fact, FactGrid, Loading, SectionHeading } from '@/ui/primitives';

/** One inventory unit: product, serial number, prices, who added it, and its sale if sold. */
export default function UnitDetailsScreen() {
  const { unitId } = useLocalSearchParams<{ unitId: string }>();
  const { t, money, date } = useFormat();
  const { can } = useAuth();
  const confirm = useConfirm();
  const load = useLoad(() => inventory.unit(unitId), [unitId], 'Unable to load this unit.');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ serialNumber: '', sellingPrice: '', purchasePrice: '', supplierName: '', reason: '' });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const u = load.data?.unit;
  const product = load.data?.product;
  const sale = load.data?.sale;
  const [who, whoParams] = actorLabel(u?.addedBy);

  const startEdit = (unit: InventoryUnit) => {
    setSuccess('');
    setForm({
      serialNumber: unit.serialPending ? '' : unit.serialNumber,
      sellingPrice: String(unit.sellingPriceCents / 100),
      purchasePrice: unit.purchasePriceCents === null || unit.purchasePriceCents === undefined ? '' : String(unit.purchasePriceCents / 100),
      supplierName: unit.supplier.name,
      reason: ''
    });
    setTouched(false);
    setEditing(true);
  };

  const formErrors = {
    serialNumber: touched && !form.serialNumber.trim() ? 'Enter the serial number.' : '',
    sellingPrice: touched && !isMoney(form.sellingPrice) ? 'Enter an amount of zero or more, with at most 2 decimals.' : '',
    purchasePrice: touched && !isMoney(form.purchasePrice, { required: false }) ? 'Enter an amount of zero or more, with at most 2 decimals.' : ''
  };

  const save = async (unit: InventoryUnit) => {
    setTouched(true);
    if (!form.serialNumber.trim() || !isMoney(form.sellingPrice) || !isMoney(form.purchasePrice, { required: false }) || saving) return;
    setSaving(true);
    setError('');
    try {
      const { unit: updated } = await inventory.updateUnit(unit._id, {
        ...(form.serialNumber.trim() !== unit.serialNumber ? { serialNumber: form.serialNumber.trim() } : {}),
        sellingPrice: Number(form.sellingPrice),
        ...(form.purchasePrice.trim() ? { purchasePrice: Number(form.purchasePrice) } : {}),
        supplier: { ...unit.supplier, name: form.supplierName.trim() },
        reason: form.reason.trim()
      });
      load.setData(current => current ? { ...current, unit: updated } : current);
      setEditing(false);
      setSuccess('Changes saved.');
    } catch (e) {
      setError(errorMessage(e, 'Unable to save changes. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (unit: InventoryUnit) => {
    const answer = await confirm({
      title: 'Delete this unit?',
      message: '{product} with serial number {serial} will be removed from stock. This is recorded in the audit log.',
      messageParams: { product: unit.productName, serial: unit.serialNumber },
      confirmLabel: 'Delete', danger: true, reasonLabel: 'Reason (required)'
    });
    if (!answer.confirmed) return;
    try {
      await inventory.deleteUnit(unit._id, answer.reason);
      router.back();
    } catch (e) {
      setError(errorMessage(e, 'Unable to delete this unit. Please try again.'));
    }
  };

  return (
    <Screen back eyebrow="PRODUCT DETAILS" title={u?.productName || 'Product'} rawTitle={Boolean(u)} subtitle={u ? `${u.brand} · ${u.model} · ${u.productCode}` : undefined} rawSubtitle refreshing={load.refreshing} onRefresh={load.refresh}>
      <Alert text={load.error} />
      <Alert text={error} />
      <Alert kind="success" text={success} />
      {load.loading && !u ? <Loading /> : null}

      {u ? (
        <>
          {u.serialPending ? <Alert kind="warning" text="This unit came from your old stock records and has a temporary serial number. Enter the real serial number before it can be sold." /> : null}
          <Card>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Txt variant="eyebrow">{t('SERIAL NUMBER')}</Txt>
                <Txt variant="code" bold ltr style={styles.serial}>{u.serialNumber}</Txt>
              </View>
              <Badge label={UNIT_STATUS_LABEL[u.status]} tone={UNIT_STATUS_TONE[u.status]} big />
            </View>
            <FactGrid>
              <Fact label="CATEGORY" value={u.category ? t(u.category) : '—'} sub={u.subCategory ? t(u.subCategory) : undefined} />
              <Fact label="SELLING PRICE" value={money(u.sellingPriceCents)} />
              {can('inventory.viewCost') ? <Fact label="PURCHASE PRICE" value={u.purchasePriceCents === null || u.purchasePriceCents === undefined ? t('Not recorded') : money(u.purchasePriceCents)} /> : null}
              <Fact label="ADDED BY" value={t(who, whoParams)} sub={date(u.createdAt, 'medium')} />
              <Fact label="SUPPLIER" value={u.supplier.name || '—'} sub={[u.supplier.phone, u.supplier.invoiceRef].filter(Boolean).join(' ') || undefined} />
              {sale ? <Fact label="SALE" value={sale.saleNumber ?? ''} ltr sub={`${t(SALE_TYPE_LABEL[sale.type!])} · ${date(sale.soldAt, 'medium')}`} /> : null}
            </FactGrid>
            {sale && sale.mine !== false ? <Button title={t('View sale')} variant="outline" small onPress={() => router.push(`/sales/${sale._id}`)} style={styles.saleButton} /> : null}
            {product?.description ? (
              <View style={styles.description}>
                <Txt variant="eyebrow">{t('DESCRIPTION')}</Txt>
                <Txt variant="muted">{product.description}</Txt>
              </View>
            ) : null}
            {product?.imageUrls?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.images} contentContainerStyle={styles.imagesContent}>
                {product.imageUrls.map(src => <Image key={src} source={{ uri: src }} style={styles.image} accessibilityLabel={t('Photo of {product}', { product: u.productName })} />)}
              </ScrollView>
            ) : null}

            {u.status === 'AVAILABLE' && !u.serialPending && can('sales.create') ? (
              <View style={styles.actions}>
                <Txt variant="label" style={styles.actionsLabel}>{t('Mark as sold:')}</Txt>
                <Button title={t('Sold at full price')} small onPress={() => router.push(`/inventory/sell/full-price/${u._id}`)} />
                <Button title={t('Sold on installment')} variant="outline" small onPress={() => router.push(`/inventory/sell/installment/${u._id}`)} />
              </View>
            ) : null}
            {u.status === 'AVAILABLE' && can('inventory.edit') ? (
              <View style={styles.actions}>
                <Button title={t(u.serialPending ? 'Enter real serial number' : 'Edit')} variant="outline" small onPress={() => startEdit(u)} />
                {can('inventory.delete') ? <Button title={t('Delete')} variant="danger" small onPress={() => void remove(u)} /> : null}
              </View>
            ) : null}
          </Card>

          {editing ? (
            <Card>
              <SectionHeading title="Correct this unit" text="Changes are recorded in the audit log." />
              <Field label="Serial number" value={form.serialNumber} onChangeText={v => setForm(f => ({ ...f, serialNumber: v }))} error={formErrors.serialNumber} ltr autoCapitalize="characters" autoCorrect={false} maxLength={100} />
              <Field label="Selling price (Rs)" value={form.sellingPrice} onChangeText={v => setForm(f => ({ ...f, sellingPrice: v }))} error={formErrors.sellingPrice} ltr keyboardType="decimal-pad" />
              <Field label="Purchase price (Rs)" value={form.purchasePrice} onChangeText={v => setForm(f => ({ ...f, purchasePrice: v }))} error={formErrors.purchasePrice} ltr keyboardType="decimal-pad" />
              <Field label="Supplier" value={form.supplierName} onChangeText={v => setForm(f => ({ ...f, supplierName: v }))} maxLength={120} />
              <Field label="Reason for the change" optional value={form.reason} onChangeText={v => setForm(f => ({ ...f, reason: v }))} maxLength={500} />
              <View style={styles.formActions}>
                <Button title={t('Cancel')} variant="outline" small onPress={() => setEditing(false)} />
                <Button title={t(saving ? 'Saving...' : 'Save changes')} small loading={saving} onPress={() => void save(u)} />
              </View>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: space.lg },
  headerText: { flex: 1 },
  serial: { fontSize: 20, lineHeight: 26 },
  saleButton: { alignSelf: 'flex-start', marginBottom: space.md },
  description: { marginBottom: space.md, gap: 4 },
  images: { marginBottom: space.md },
  imagesContent: { gap: 10 },
  image: { width: 140, height: 140, borderRadius: 12, backgroundColor: '#F1E9DC' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: space.sm },
  actionsLabel: { marginRight: 4 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 }
});
