import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { errorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { space } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { Alert, Card } from '@/ui/primitives';

/** Shop owner sign-in. */
export default function LoginScreen() {
  const { t } = useI18n();
  const { loginOwner, expiredNotice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const emailError = touched && !email.trim() ? 'Enter your email address.' : '';
  const passwordError = touched && !password ? 'Enter your password.' : '';

  const submit = async () => {
    setTouched(true);
    if (!email.trim() || !password || loading) return;
    setLoading(true);
    setError('');
    try {
      await loginOwner(email.trim(), password);
      // The root layout switches to the app once the session exists.
    } catch (e) {
      setError(errorMessage(e, 'Unable to sign in'));
      setLoading(false);
    }
  };

  return (
    <Screen back eyebrow="WELCOME BACK" title="Sign in to your shop" subtitle="Your workspace is waiting for you.">
      <Card>
        {expiredNotice && !error ? <Alert kind="warning" text={expiredNotice} /> : null}
        <Alert text={error} />
        <Field label="Email address" value={email} onChangeText={setEmail} error={emailError} ltr autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" placeholder="you@example.com" />
        <Field label="Password" value={password} onChangeText={setPassword} error={passwordError} ltr secureTextEntry textContentType="password" autoComplete="password" placeholder={t('Your password')} onSubmitEditing={submit} returnKeyType="go" />
        <Button title={t(loading ? 'Signing in...' : 'Sign in →')} loading={loading} full onPress={submit} />
        <Pressable onPress={() => router.push('/forgot-password')} style={styles.link}>
          <Txt variant="link" center>{t('Forgot your password?')}</Txt>
        </Pressable>
      </Card>
      <Pressable onPress={() => router.replace('/register')} style={styles.link}>
        <Txt variant="small" center>{t('Ready to get started?')} <Txt variant="link" style={styles.small}>{t('Register your shop →')}</Txt></Txt>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { marginTop: space.lg, paddingVertical: 4 },
  small: { fontSize: 12.5 }
});
