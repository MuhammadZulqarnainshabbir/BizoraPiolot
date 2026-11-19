import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage, isApiError } from '@/api/client';
import { inventory } from '@/api/endpoints';
import type { InventoryUnit, Product, ProductCategory } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { useLoad } from '@/hooks/useLoad';
import { space } from '@/theme';
import { duplicateSerials, isMoney, parseImageUrls, parseSerials } from '@/utils/forms';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { Alert, Card, SectionHeading, Segmented } from '@/ui/primitives';

type Mode = 'new' | 'existing';

/**
 * Adds stock: a product (existing, or new with brand/model/category) and one serial number per
 * physical unit. The server records who added each unit.
 */
export default function AddStockScreen() {
  const { t } = useFormat();
  const { can } = useAuth();
  const params = useLocalSearchParams<{ productId?: string }>();
  const categories = useLoad<ProductCategory[]>(() => inventory.categories(), [], 'Unable to load product categories. Reload the page to try again.');
  const catalog = useLoad(() => inventory.products({ page: 1, limit: 100, search: '', sort: 'brand', order: 'asc' }), []);

  const [mode, setMode] = useState<Mode>(params.productId ? 'existing' : 'new');
  const [productId, setProductId] = useState(params.productId ?? '');
  const [product, setProduct] = useState({ name: '', brand: '', model: '', category: '', subCategory: '', description: '', imageUrls: '' });
  const [serials, setSerials] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [supplier, setSupplier] = useState({ name: '', phone: '', invoiceRef: '' });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState<string[]>([]);
  const [added, setAdded] = useState<{ product: Product; units: InventoryUnit[] } | null>(null);

  const products = (catalog.data?.records ?? []) as Product[];
  useEffect(() => { if (!products.length && mode === 'existing' && !params.productId) setMode('new'); }, [products.length, mode, params.productId]);

  const setP = (key: keyof typeof product) => (value: string) => setProduct(p => ({ ...p, [key]: value }));
  const subCategories = useMemo(() => categories.data?.find(c => c.name === product.category)?.subCategories ?? [], [categories.data, product.category]);
  const serialList = useMemo(() => parseSerials(serials), [serials]);
  const duplicates = useMemo(() => duplicateSerials(serialList), [serialList]);
  const images = useMemo(() => parseImageUrls(product.imageUrls), [product.imageUrls]);

  const errors = {
    productId: touched && mode === 'existing' && !productId ? 'Choose a product.' : '',
    name: touched && mode === 'new' && !product.name.trim() ? 'Enter the product name.' : '',
    brand: touched && mode === 'new' && !product.brand.trim() ? 'Enter the brand.' : '',
    model: touched && mode === 'new' && !product.model.trim() ? 'Enter the model.' : '',
    category: touched && mode === 'new' && !product.category ? 'Choose a category.' : '',
    subCategory: touched && mode === 'new' && !product.subCategory ? 'Choose a sub-category.' : '',
    imageUrls: touched && mode === 'new' && !images.valid ? 'Use up to 5 links starting with http:// or https://' : '',
    serials: touched && !serialList.length ? 'Enter at least one serial number. Every unit needs one.' : '',
    purchasePrice: touched && !isMoney(purchasePrice) ? 'Enter an amount of zero or more, with at most 2 decimals.' : '',
    sellingPrice: touched && !isMoney(sellingPrice) ? 'Enter an amount of zero or more, with at most 2 decimals.' : ''
  };
  const valid = (mode === 'existing' ? Boolean(productId) : Boolean(product.name.trim() && product.brand.trim() && product.model.trim() && product.category && product.subCategory && images.valid))
    && serialList.length > 0 && isMoney(purchasePrice) && isMoney(sellingPrice);

  const submit = async () => {
    setTouched(true);
    setError('');
    setRejected([]);
    if (!valid) { setError('Check the highlighted fields.'); return; }
    if (duplicates.length) { setError(t('Entered more than once: {serials}', { serials: duplicates.join(', ') })); return; }
    setSaving(true);
    try {
      const result = await inventory.addStock({
        ...(mode === 'existing' ? { productId } : {
          product: { name: product.name.trim(), brand: product.brand.trim(), model: product.model.trim(), category: product.category, subCategory: product.subCategory, description: product.description.trim(), imageUrls: images.urls }
        }),
        serialNumbers: serialList,
        purchasePrice: Number(purchasePrice),
        sellingPrice: Number(sellingPrice),
        supplier: { name: supplier.name.trim(), phone: supplier.phone.trim(), invoiceRef: supplier.invoiceRef.trim() }
      });
      setAdded(result);
    } catch (e) {
      setError(errorMessage(e, 'Unable to add stock. Please try again.'));
      if (isApiError(e) && e.code === 'DUPLICATE_SERIAL') setRejected(((e.details as { serials?: string[] } | undefined)?.serials) ?? []);
    } finally {
      setSaving(false);
    }
  };

  const addMore = () => {
    const id = added?.product._id ?? '';
    setAdded(null);
    setTouched(false);
    void catalog.silentReload();
    setMode('existing');
    setProductId(id);
    setSerials('');
    setSupplier({ name: '', phone: '', invoiceRef: '' });
  };

  if (added) {
    return (
      <Screen back eyebrow="INVENTORY" title="Add stock">
        <Card>
          <Alert kind="success" text={added.units.length === 1 ? '1 unit of {product} added to stock.' : '{count} units of {product} added to stock.'} params={{ count: added.units.length, product: added.product.name }} />
          {added.units.map(u => (
            <Txt key={u._id} variant="code" ltr style={styles.serial} onPress={() => router.push(`/inventory/units/${u._id}`)}>{u.serialNumber}</Txt>
          ))}
          <View style={styles.actions}>
            <Button title={t('View inventory')} variant="outline" onPress={() => router.replace('/inventory')} />
            <Button title={t('Add more stock')} onPress={addMore} />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back eyebrow="INVENTORY" title="Add stock" subtitle="Every unit needs its own serial number. Enter one per line.">
      {error ? (
        <Alert text={error} />
      ) : null}
      {rejected.length ? <Alert kind="warning" text="Already in your stock: {serials}" params={{ serials: rejected.join(', ') }} /> : null}
      <Alert text={categories.error} />

      <Card>
        <SectionHeading title="Product" />
        <Segmented value={mode} onChange={setMode} options={[{ value: 'new', label: 'New product' }, { value: 'existing', label: 'Existing product' }]} />
        {mode === 'existing' ? (
          <Select label="Product" value={productId} onChange={setProductId} error={errors.productId} placeholder={products.length ? 'Choose a product' : 'Your catalog is empty'}
            options={products.map(p => ({ value: p._id, label: `${p.brand} ${p.model} — ${p.name}`, raw: true }))} />
        ) : (
          <>
            <Field label="Product name" value={product.name} onChangeText={setP('name')} error={errors.name} maxLength={120} placeholder={t('e.g. Samsung Galaxy S25 Ultra 256GB')} />
            <Field label="Brand" value={product.brand} onChangeText={setP('brand')} error={errors.brand} maxLength={60} placeholder={t('e.g. Samsung')} />
            <Field label="Model" value={product.model} onChangeText={setP('model')} error={errors.model} ltr maxLength={80} placeholder={t('e.g. Galaxy S25')} autoCapitalize="none" />
            <Select label="Category" value={product.category} error={errors.category} placeholder={categories.data?.length ? 'Choose a category' : 'Loading categories...'}
              options={(categories.data ?? []).map(c => ({ value: c.name, label: c.name }))}
              onChange={name => { const subs = categories.data?.find(c => c.name === name)?.subCategories ?? []; setProduct(p => ({ ...p, category: name, subCategory: subs.length === 1 ? subs[0] : '' })); }} />
            <Select label="Sub-category" value={product.subCategory} onChange={setP('subCategory')} error={errors.subCategory} disabled={!product.category}
              placeholder={product.category ? 'Choose a sub-category' : 'Choose a category first'} options={subCategories.map(s => ({ value: s, label: s }))} />
            <Field label="Description" optional value={product.description} onChangeText={setP('description')} multiline maxLength={1000} />
            <Field label="Image links" optional="Optional · one https:// link per line, up to 5" value={product.imageUrls} onChangeText={setP('imageUrls')} error={errors.imageUrls} ltr multiline autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          </>
        )}
      </Card>

      <Card>
        <SectionHeading title="Serial numbers" />
        <Field label="One serial number per line" value={serials} onChangeText={setSerials} error={errors.serials} ltr multiline autoCapitalize="characters" autoCorrect={false} placeholder="SAM001" />
        <Txt variant="small" color={duplicates.length ? '#aa3333' : undefined}>
          {serialList.length === 1 ? t('1 unit will be added.') : t('{count} units will be added.', { count: serialList.length })}
          {duplicates.length ? ` ${t('Entered more than once: {serials}', { serials: duplicates.join(', ') })}` : ''}
        </Txt>
      </Card>

      <Card>
        <SectionHeading title="Prices and supplier" />
        <Field label="Purchase price (Rs)" value={purchasePrice} onChangeText={setPurchasePrice} error={errors.purchasePrice} ltr keyboardType="decimal-pad" hint={can('inventory.viewCost') ? undefined : 'Only the shop owner can change this later.'} />
        <Field label="Selling price (Rs)" value={sellingPrice} onChangeText={setSellingPrice} error={errors.sellingPrice} ltr keyboardType="decimal-pad" />
        <Field label="Supplier" optional value={supplier.name} onChangeText={v => setSupplier(s => ({ ...s, name: v }))} maxLength={120} />
        <Field label="Supplier phone" optional value={supplier.phone} onChangeText={v => setSupplier(s => ({ ...s, phone: v }))} ltr keyboardType="phone-pad" maxLength={40} />
        <Field label="Supplier invoice" optional value={supplier.invoiceRef} onChangeText={v => setSupplier(s => ({ ...s, invoiceRef: v }))} ltr maxLength={60} autoCapitalize="none" />
      </Card>

      <View style={styles.actions}>
        <Button title={t('Cancel')} variant="outline" onPress={() => router.back()} />
        <Button title={t(saving ? 'Saving...' : serialList.length > 1 ? 'Add {count} units' : 'Add to stock', { count: serialList.length })} loading={saving} onPress={submit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  serial: { paddingVertical: 4, color: '#7A6240' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: space.sm, marginBottom: space.xl }
});
