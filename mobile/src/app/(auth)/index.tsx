import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { getApiUrl } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useLayout } from '@/hooks/useLayout';
import { useI18n } from '@/i18n/I18nContext';
import { colors, radius, space } from '@/theme';
import { Button } from '@/ui/Button';
import { LanguageSwitch } from '@/ui/LanguageSwitch';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { Alert, Card } from '@/ui/primitives';

/** Landing: choose how to sign in. Shown only while signed out. */
export default function LandingScreen() {
  const { t } = useI18n();
  const { compact } = useLayout();
  const { expiredNotice, lastEmployeeShop } = useAuth();

  return (
    <Screen>
      <View style={styles.top}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Ionicons name="cube" size={22} color={colors.gold} /></View>
          <Txt variant="h2">Bizora <Txt variant="h2" color={colors.gold}>Pilot</Txt></Txt>
        </View>
        <LanguageSwitch />
      </View>

      <Txt variant="eyebrow" style={styles.eyebrow}>{t('✦ THE SMARTER WAY TO RUN YOUR STORE')}</Txt>
      <Txt variant="h1" style={[styles.title, compact && styles.titleCompact]}>{t('Your business.')} {t('Beautifully managed.')}</Txt>
      <Txt variant="muted" style={styles.lead}>{t('From stock and sales to customers and staff, give your business the tools it deserves. Organize everything in one simple place.')}</Txt>

      <Alert kind="warning" text={expiredNotice} />

      <Txt variant="label" style={styles.chooser}>{t('How do you want to sign in?')}</Txt>

      <Card>
        <Txt variant="eyebrow">{t('Partner portal')}</Txt>
        <Txt variant="h3" style={styles.cardTitle}>{t('I’m the shop owner')}</Txt>
        <Txt variant="small" style={styles.cardText}>{t('Sign in with your email address and password.')}</Txt>
        <Button title={t('Login as owner')} full onPress={() => router.push('/login')} />
        <Pressable onPress={() => router.push('/register')} style={styles.textLink}>
          <Txt variant="small" center>{t('Ready to get started?')} <Txt variant="link" style={styles.linkSmall}>{t('Register your shop →')}</Txt></Txt>
        </Pressable>
      </Card>

      <Card>
        <Txt variant="eyebrow">{t('EMPLOYEE SIGN-IN')}</Txt>
        <Txt variant="h3" style={styles.cardTitle}>{t('I’m an employee')}</Txt>
        <Txt variant="small" style={styles.cardText}>{lastEmployeeShop ? `${lastEmployeeShop.shopName} · ` : ''}{t('Sign in with the shop code, employee ID and password from your shop owner.')}</Txt>
        <Button title={t('Login as employee')} variant="dark" full onPress={() => router.push('/employee-login')} />
      </Card>

      <Pressable onPress={() => router.push('/server')} style={styles.server}>
        <Ionicons name="server-outline" size={14} color={colors.muted} />
        <Txt variant="small" ltr numberOfLines={1} style={styles.serverText}>{getApiUrl()}</Txt>
        <Txt variant="link" style={styles.linkSmall}>{t('Change')}</Txt>
      </Pressable>
      <Txt variant="small" center style={styles.footer}>{t('© 2026 Bizora Pilot · Business management')}</Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { marginBottom: 10 },
  title: { fontSize: 32, lineHeight: 38, marginBottom: 12 },
  titleCompact: { fontSize: 27, lineHeight: 33 },
  lead: { marginBottom: space.xl, lineHeight: 23 },
  chooser: { marginBottom: space.md },
  cardTitle: { marginTop: 4, marginBottom: 4 },
  cardText: { marginBottom: space.lg },
  textLink: { marginTop: space.md },
  linkSmall: { fontSize: 12.5 },
  server: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 10 },
  serverText: { maxWidth: '60%' },
  footer: { marginTop: space.md }
});
