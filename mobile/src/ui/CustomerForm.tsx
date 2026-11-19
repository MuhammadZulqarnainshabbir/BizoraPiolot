import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage, isApiError } from '@/api/client';
import { customers } from '@/api/endpoints';
import type { CustomerRecord } from '@/api/models';
import { useI18n } from '@/i18n/I18nContext';
import { space } from '@/theme';
import { isCnic } from '@/utils/images';
import { Button } from './Button';
import { Field } from './Field';
import { Alert, Card } from './primitives';

/** Create or edit a customer's details. ID pictures are managed on the customer's page. */
export function CustomerForm({ initial, onSaved }: { initial?: CustomerRecord; onSaved: (customer: CustomerRecord) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [cnic, setCnic] = useState(initial?.cnicFormatted ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [clash, setClash] = useState<{ id: string; name: string; code: string } | null>(null);

  const errors = {
    name: touched && !name.trim() ? 'Enter the customer’s name.' : '',
    phone: touched && !phone.trim() ? 'Enter the customer’s phone number.' : '',
    cnic: touched && !isCnic(cnic) ? 'CNIC must be 13 digits (e.g. 12345-1234567-1)' : ''
  };

  const submit = async () => {
    setTouched(true);
    setError('');
    setClash(null);
    if (!name.trim() || !phone.trim() || !isCnic(cnic) || saving) { setError('Check the highlighted fields.'); return; }
    setSaving(true);
    const data = { name: name.trim(), phone: phone.trim(), cnic: cnic.trim(), address: address.trim(), notes: notes.trim() };
    try {
      const res = initial ? await customers.update(initial._id, { ...data, reason: reason.trim() }) : await customers.create(data);
      onSaved(res.customer);
    } catch (e) {
      const details = isApiError(e) && e.code === 'DUPLICATE_CNIC' ? (e.details as { customerId?: string; name?: string; customerCode?: string } | undefined) : undefined;
      if (details?.customerId) {
        setClash({ id: details.customerId, name: details.name ?? '', code: details.customerCode ?? '' });
        setError(t('Another customer already has this CNIC: {name} ({code}).', { name: details.name, code: details.customerCode }));
      } else {
        setError(errorMessage(e, 'Unable to save the customer. Please try again.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Alert text={error} />
      {clash ? <Button title={t('Open that customer')} variant="outline" small onPress={() => router.push(`/customers/${clash.id}`)} style={styles.clash} /> : null}
      <Field label="Customer name" value={name} onChangeText={setName} error={errors.name} maxLength={120} textContentType="name" />
      <Field label="Customer phone" value={phone} onChangeText={setPhone} error={errors.phone} ltr keyboardType="phone-pad" placeholder="0301-1234567" maxLength={40} />
      <Field label="CNIC" optional value={cnic} onChangeText={setCnic} error={errors.cnic} ltr keyboardType="numbers-and-punctuation" placeholder="12345-1234567-1" maxLength={20} />
      <Field label="Address" optional value={address} onChangeText={setAddress} maxLength={300} />
      <Field label="Notes" optional value={notes} onChangeText={setNotes} multiline maxLength={500} />
      {initial ? <Field label="Reason for the change" optional value={reason} onChangeText={setReason} maxLength={500} /> : null}
      <View style={styles.actions}>
        <Button title={t('Cancel')} variant="outline" onPress={() => router.back()} />
        <Button title={t(saving ? 'Saving...' : initial ? 'Save changes' : 'Add customer')} loading={saving} onPress={submit} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  clash: { alignSelf: 'flex-start', marginBottom: space.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: space.sm }
});
