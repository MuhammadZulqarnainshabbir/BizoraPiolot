import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage } from '@/api/client';
import { employeeAuth } from '@/api/endpoints';
import { useAuth, useSession } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { space } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Alert, Card } from '@/ui/primitives';

/** Employee password change; also the forced first-login change after a temporary password. */
export default function PasswordScreen() {
  const { t } = useFormat();
  const session = useSession();
  const { applyEmployeeUpdate, logout, mustChangePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async () => {
    if (saving) return;
    setError('');
    setSuccess('');
    if (!current || password.length < 8 || !confirm) { setError('Fill in all fields. New passwords need at least 8 characters.'); return; }
    if (password !== confirm) { setError('New passwords do not match.'); return; }
    const wasTemporary = mustChangePassword;
    setSaving(true);
    try {
      const res = await employeeAuth.changePassword(current, password, confirm);
      applyEmployeeUpdate({ token: res.token, expiresIn: res.expiresIn, sessionEndsIn: res.sessionEndsIn }, res.employee);
      setCurrent(''); setPassword(''); setConfirm('');
      if (wasTemporary) router.replace('/home');
      else setSuccess('Your password has been changed.');
    } catch (e) {
      setError(errorMessage(e, 'Unable to change password'));
    } finally {
      setSaving(false);
    }
  };

  if (session?.role !== 'employee') return null;
  return (
    <Screen back={!mustChangePassword} eyebrow="ACCOUNT" title="Change password" subtitle="Choose a password only you know.">
      {mustChangePassword ? <Alert kind="warning" text="You’re signed in with a temporary password from your shop owner. Choose a new password to continue." /> : null}
      <Alert text={error} />
      <Alert kind="success" text={success} />
      <Card>
        <Field label="Current password" value={current} onChangeText={setCurrent} ltr secureTextEntry textContentType="password" />
        <Field label="New password" value={password} onChangeText={setPassword} ltr secureTextEntry textContentType="newPassword" placeholder={t('At least 8 characters')} maxLength={128} />
        <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} ltr secureTextEntry textContentType="newPassword" maxLength={128} onSubmitEditing={submit} returnKeyType="done" />
        <Button title={t(saving ? 'Saving...' : 'Change password')} loading={saving} full onPress={submit} />
        {mustChangePassword ? <View style={styles.logout}><Button title={t('Log out')} variant="ghost" full onPress={() => void logout()} /></View> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logout: { marginTop: space.md }
});
