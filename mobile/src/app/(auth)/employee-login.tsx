import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { errorMessage, isApiError } from '@/api/client';
import { employeeAuth } from '@/api/endpoints';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { colors, radius, space } from '@/theme';
import { isShopCode, normalizeShopCode } from '@/utils/forms';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { Alert, Card } from '@/ui/primitives';

/**
 * Employee sign-in: shop code + employee ID + password in one step. The server looks the shop
 * up by its code and checks the employee belongs to it; a wrong code, ID or password all get
 * the same answer. The shop code is remembered on this phone after the first sign-in.
 */
export default function EmployeeLoginScreen() {
  const { t } = useI18n();
  const { loginEmployee, expiredNotice, lastEmployeeShop } = useAuth();
  const [shopCode, setShopCode] = useState(lastEmployeeShop?.shopCode ?? '');
  const [shopName, setShopName] = useState(lastEmployeeShop?.shopName ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const code = normalizeShopCode(shopCode);
  const codeValid = isShopCode(code);

  // Show which shop a complete code belongs to, so a typo is caught before the password is typed.
  useEffect(() => {
    if (!codeValid) { setShopName(''); return; }
    if (lastEmployeeShop && lastEmployeeShop.shopCode === code) { setShopName(lastEmployeeShop.shopName); return; }
    let cancelled = false;
    employeeAuth.shopInfoByCode(code)
      .then(res => { if (!cancelled) setShopName(res.shop.shopName); })
      .catch(() => { if (!cancelled) setShopName(''); });
    return () => { cancelled = true; };
  }, [code, codeValid, lastEmployeeShop]);

  const errors = {
    shopCode: touched && !codeValid ? 'Enter the 6-character shop code from your shop owner.' : '',
    employeeId: touched && !employeeId.trim() ? 'Enter your employee ID.' : '',
    password: touched && !password ? 'Enter your password.' : ''
  };

  const submit = async () => {
    setTouched(true);
    if (!codeValid || !employeeId.trim() || !password || loading) return;
    setLoading(true);
    setError('');
    try {
      await loginEmployee(code, employeeId.trim().toUpperCase(), password);
      // The root layout switches to the app; a temporary password sends the employee to "Change password".
    } catch (e) {
      setError(isApiError(e) && e.status === 401 ? 'Invalid shop code, employee ID or password' : errorMessage(e, 'Unable to sign in'));
      setLoading(false);
    }
  };

  return (
    <Screen back eyebrow="EMPLOYEE SIGN-IN" title="Employee" subtitle="Sign in with the shop code, employee ID and password from your shop owner.">
      <Card>
        {shopName ? (
          <View style={styles.shopRow}>
            <View style={styles.shopMark}><Txt variant="h2" color={colors.goldText}>{shopName.charAt(0).toUpperCase()}</Txt></View>
            <View style={styles.shopText}>
              <Txt variant="eyebrow">{t('Shop')}</Txt>
              <Txt variant="h3">{shopName}</Txt>
            </View>
          </View>
        ) : null}
        {expiredNotice && !error ? <Alert kind="warning" text={expiredNotice} /> : null}
        <Alert text={error} />
        <Field label="Shop code" value={shopCode} onChangeText={v => { setShopCode(v); setError(''); }} error={errors.shopCode} ltr autoCapitalize="characters" autoCorrect={false} placeholder="7K3QM2" maxLength={8} hint={shopName ? undefined : 'The owner finds it on Shop profile.'} />
        <Field label="Employee ID" value={employeeId} onChangeText={setEmployeeId} error={errors.employeeId} ltr autoCapitalize="characters" autoCorrect={false} placeholder="EMP-0001" maxLength={20} textContentType="username" />
        <Field label="Password" value={password} onChangeText={setPassword} error={errors.password} ltr secureTextEntry textContentType="password" placeholder={t('Your password')} maxLength={128} onSubmitEditing={submit} returnKeyType="go" />
        <Button title={t(loading ? 'Signing in...' : 'Sign in →')} loading={loading} full onPress={submit} />
        <Txt variant="small" center style={styles.hint}>{t('Forgot your password? Ask your shop owner to reset it.')}</Txt>
      </Card>
      <Pressable onPress={() => router.replace('/login')} style={styles.switch}>
        <Txt variant="small" center>{t('Shop owner?')} <Txt variant="link" style={styles.small}>{t('Login')}</Txt></Txt>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.lg },
  shopMark: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  shopText: { flex: 1 },
  hint: { marginTop: space.lg },
  switch: { marginTop: space.md, paddingVertical: 4 },
  small: { fontSize: 12.5 }
});
