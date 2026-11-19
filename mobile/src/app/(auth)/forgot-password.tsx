import React, { useState } from 'react';
import { errorMessage } from '@/api/client';
import { auth } from '@/api/endpoints';
import { useI18n } from '@/i18n/I18nContext';
import { isEmail } from '@/utils/forms';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Alert, Card } from '@/ui/primitives';

/** Sends a password reset link (needs SMTP configured on the server). */
export default function ForgotPasswordScreen() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const submit = async () => {
    setTouched(true);
    if (!isEmail(email) || loading) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await auth.forgotPassword(email.trim());
      setMessage(res.message);
    } catch (e) {
      setError(errorMessage(e, 'Unable to send a reset link. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen back eyebrow="PASSWORD RECOVERY" title="Forgot your password?" subtitle="Enter your email address and we’ll send you a link to reset it. The link is opened on the web app.">
      <Card>
        <Alert text={error} />
        <Alert kind="success" text={message} />
        <Field label="Email address" value={email} onChangeText={setEmail} error={touched && !isEmail(email) ? 'Enter a valid email address.' : ''} ltr autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" onSubmitEditing={submit} returnKeyType="send" />
        <Button title={t(loading ? 'Sending...' : 'Send reset link')} loading={loading} full onPress={submit} />
      </Card>
    </Screen>
  );
}
