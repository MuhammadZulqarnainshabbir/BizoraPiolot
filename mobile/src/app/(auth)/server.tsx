import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { defaultApiUrl, getApiUrl, saveApiUrl } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { space } from '@/theme';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { Alert, Card } from '@/ui/primitives';

/**
 * Where the API lives. By default it's the computer running `npx expo start`, port 3000, which
 * is right for `npm run dev` in backend/ with the phone on the same Wi-Fi. Change it for a
 * deployed server (e.g. https://shop.example.com/api/v1).
 */
export default function ServerScreen() {
  const { t } = useI18n();
  const [url, setUrl] = useState(getApiUrl());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const save = async (value: string) => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const applied = await saveApiUrl(value);
      setUrl(applied);
      setMessage('Server address saved.');
    } catch {
      setError('Unable to save the server address.');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError('');
    setMessage('');
    const base = url.trim().replace(/\/+$/, '');
    const health = `${base.replace(/\/api\/v1$/, '')}/api/health`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(health, { signal: controller.signal });
      clearTimeout(timer);
      const body = await res.json().catch(() => null);
      if (res.ok && body?.status === 'ok') setMessage('Connected: the API answered at {url}.');
      else setError('The server at {url} answered, but not like the Bizora Pilot API.');
    } catch {
      setError('Can’t reach {url}. Check the address, that the API is running, and that the phone and computer share a Wi-Fi network.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Screen back eyebrow="SETTINGS" title="API server" subtitle="The address this app talks to.">
      <Card>
        <Alert text={error} params={{ url: url.trim() }} />
        <Alert kind="success" text={message} params={{ url: url.trim() }} />
        <Field label="Server address" value={url} onChangeText={setUrl} ltr autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.20:3000/api/v1" hint="Include /api/v1 at the end." />
        <Button title={t(testing ? 'Testing...' : 'Test connection')} variant="outline" loading={testing} full onPress={test} style={styles.button} />
        <Button title={t(saving ? 'Saving...' : 'Save')} loading={saving} full onPress={() => void save(url)} style={styles.button} />
        <Button title={t('Use the automatic address')} variant="ghost" full onPress={() => void save('')} />
        <Txt variant="small" style={styles.note}>{t('Automatic address: {url} (the computer running Expo, port 3000).', { url: defaultApiUrl() })}</Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: { marginBottom: space.md },
  note: { marginTop: space.md }
});
