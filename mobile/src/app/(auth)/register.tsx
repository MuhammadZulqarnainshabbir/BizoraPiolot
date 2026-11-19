import { router } from 'expo-router';
import React, { useState } from 'react';
import { errorMessage } from '@/api/client';
import { auth } from '@/api/endpoints';
import { useI18n } from '@/i18n/I18nContext';
import { isEmail } from '@/utils/forms';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { Alert, Card } from '@/ui/primitives';

type Draft = { shopName: string; ownerName: string; email: string; phone: string; address: string; password: string; confirmPassword: string };
const EMPTY: Draft = { shopName: '', ownerName: '', email: '', phone: '', address: '', password: '', confirmPassword: '' };

/** Shop-owner registration. Creates the shop; the owner then signs in. */
export default function RegisterScreen() {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const set = (key: keyof Draft) => (value: string) => setDraft(d => ({ ...d, [key]: value }));
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (touched) {
    if (!draft.shopName.trim()) errors.shopName = 'Enter your shop name.';
    if (!draft.ownerName.trim()) errors.ownerName = 'Enter the owner’s name.';
    if (!isEmail(draft.email)) errors.email = 'Enter a valid email address.';
    if (!draft.phone.trim()) errors.phone = 'Enter a phone number.';
    if (!draft.address.trim()) errors.address = 'Enter the shop address.';
    if (draft.password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (draft.password !== draft.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  }

  const submit = async () => {
    setTouched(true);
    const valid = draft.shopName.trim() && draft.ownerName.trim() && isEmail(draft.email) && draft.phone.trim() && draft.address.trim() && draft.password.length >= 8 && draft.password === draft.confirmPassword;
    if (!valid || saving) { setError('Check the highlighted fields.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await auth.register({ ...draft, shopName: draft.shopName.trim(), ownerName: draft.ownerName.trim(), email: draft.email.trim(), phone: draft.phone.trim(), address: draft.address.trim() });
      setDone(res.message || 'Shop registered successfully');
    } catch (e) {
      setError(errorMessage(e, 'Unable to register. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Screen back eyebrow="GET STARTED" title="Your shop is registered">
        <Card>
          <Alert kind="success" text={done} />
          <Txt variant="muted" style={{ marginBottom: 16 }}>{t('Sign in with your email address and password to open your partner portal.')}</Txt>
          <Button title={t('Login')} full onPress={() => router.replace('/login')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back eyebrow="GET STARTED" title="Register your shop" subtitle="Create your free shop-owner account and set up your workspace.">
      <Card>
        <Alert text={error} />
        <Field label="Shop name" value={draft.shopName} onChangeText={set('shopName')} error={errors.shopName} maxLength={200} />
        <Field label="Owner name" value={draft.ownerName} onChangeText={set('ownerName')} error={errors.ownerName} maxLength={200} textContentType="name" />
        <Field label="Email address" value={draft.email} onChangeText={set('email')} error={errors.email} ltr autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" maxLength={254} />
        <Field label="Phone number" value={draft.phone} onChangeText={set('phone')} error={errors.phone} ltr keyboardType="phone-pad" textContentType="telephoneNumber" maxLength={200} />
        <Field label="Shop address" value={draft.address} onChangeText={set('address')} error={errors.address} maxLength={200} />
        <Field label="Password" value={draft.password} onChangeText={set('password')} error={errors.password} ltr secureTextEntry textContentType="newPassword" placeholder={t('At least 8 characters')} maxLength={128} />
        <Field label="Confirm password" value={draft.confirmPassword} onChangeText={set('confirmPassword')} error={errors.confirmPassword} ltr secureTextEntry textContentType="newPassword" maxLength={128} />
        <Button title={t(saving ? 'Saving...' : 'Create your shop account →')} loading={saving} full onPress={submit} />
      </Card>
    </Screen>
  );
}
