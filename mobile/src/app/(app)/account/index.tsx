import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessage, getApiUrl } from '@/api/client';
import { auth as ownerApi } from '@/api/endpoints';
import { useAuth, useSession } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { colors, radius, space } from '@/theme';
import { TIMEZONES } from '@/utils/labels';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { LanguageSwitch } from '@/ui/LanguageSwitch';
import { Screen } from '@/ui/Screen';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { useConfirm } from '@/ui/dialogs';
import { Alert, Card, Fact, FactGrid, QuickLink, SectionHeading } from '@/ui/primitives';

/** Owner: shop profile, time zone, employee login link and team. Employee: account details and password. */
export default function AccountScreen() {
  const session = useSession();
  if (!session) return null;
  return session.role === 'owner' ? <ShopProfile /> : <EmployeeAccount />;
}

function LogoutCard() {
  const { t } = useFormat();
  const { logout } = useAuth();
  const confirm = useConfirm();
  const signOut = async () => {
    const answer = await confirm({ title: 'Log out?', message: 'You’ll need to sign in again to use the app.', confirmLabel: 'Log out', cancelLabel: 'Stay' });
    if (answer.confirmed) await logout();
  };
  return (
    <Card>
      <SectionHeading title="Language" />
      <LanguageSwitch />
      <View style={styles.server}>
        <Txt variant="small">{t('API server')}: <Txt variant="small" ltr>{getApiUrl()}</Txt></Txt>
        <Txt variant="small">{t('Log out to change the server address.')}</Txt>
      </View>
      <Button title={t('Log out')} variant="outline" full onPress={() => void signOut()} style={styles.logout} />
    </Card>
  );
}

function ShopProfile() {
  const { t } = useFormat();
  const session = useSession();
  const { setShop } = useAuth();
  const shop = session?.role === 'owner' ? session.shop : null;
  const [timezone, setTimezone] = useState(shop?.timezone || 'Asia/Karachi');
  const [tzSaving, setTzSaving] = useState(false);
  const [tzMessage, setTzMessage] = useState('');
  const [tzError, setTzError] = useState('');
  const [copied, setCopied] = useState('');
  const [receipt, setReceipt] = useState({ ntn: shop?.ntn ?? '', strn: shop?.strn ?? '', receiptNote: shop?.receiptNote ?? '' });
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [receiptMessage, setReceiptMessage] = useState('');
  const [receiptError, setReceiptError] = useState('');
  if (!shop) return null;

  const saveReceipt = async () => {
    setReceiptSaving(true);
    setReceiptError('');
    setReceiptMessage('');
    try {
      const res = await ownerApi.updateSettings({ ntn: receipt.ntn.trim(), strn: receipt.strn.trim(), receiptNote: receipt.receiptNote.trim() });
      setShop(res.shop);
      setReceiptMessage('Receipt details saved.');
    } catch (e) {
      setReceiptError(errorMessage(e, 'Unable to save changes. Please try again.'));
    } finally {
      setReceiptSaving(false);
    }
  };

  const zones = TIMEZONES.includes(shop.timezone) ? TIMEZONES : [shop.timezone, ...TIMEZONES];
  const loginPath = `/${shop.slug}/${shop.id}/employee/login`;

  const saveTimezone = async () => {
    setTzSaving(true);
    setTzError('');
    setTzMessage('');
    try {
      const res = await ownerApi.updateSettings({ timezone });
      setShop(res.shop);
      setTzMessage('Time zone saved.');
    } catch (e) {
      setTzError(errorMessage(e, 'Unable to save changes. Please try again.'));
    } finally {
      setTzSaving(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await Clipboard.setStringAsync(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <Screen eyebrow="ACCOUNT SETTINGS" title="Shop profile" subtitle="Your shop, owner information, and team.">
      <Card tone="ink">
        <View style={styles.banner}>
          <View style={styles.avatar}><Txt variant="h1" color={colors.goldText}>{shop.shopName.charAt(0).toUpperCase()}</Txt></View>
          <View style={styles.bannerText}>
            <Txt variant="eyebrow" color={colors.onInkMuted}>{t('SHOP PROFILE')}</Txt>
            <Txt variant="h2" color={colors.onInk}>{shop.shopName}</Txt>
            <Txt variant="small" color={colors.onInkMuted}>{t('Shop owner account')} · {t('Registered')}</Txt>
          </View>
        </View>
      </Card>

      <Card>
        <SectionHeading title="Business information" text="Details provided when you registered your shop." />
        <FactGrid>
          <Fact label="SHOP NAME" value={shop.shopName} />
          <Fact label="OWNER" value={shop.ownerName} />
          <Fact label="EMAIL ADDRESS" value={shop.email} ltr />
          <Fact label="PHONE NUMBER" value={shop.phone} ltr />
          <Fact label="SHOP ADDRESS" value={shop.address} flex />
        </FactGrid>
      </Card>

      <Card>
        <SectionHeading title="Time zone" text="Sale times, “today” totals and installment due dates use this time zone." />
        <Alert text={tzError} />
        <Alert kind="success" text={tzMessage} />
        <Select label="Time zone" value={timezone} onChange={v => { setTimezone(v); setTzMessage(''); }} options={zones.map(z => ({ value: z, label: z, raw: true }))} />
        <Button title={t(tzSaving ? 'Saving...' : 'Save')} small loading={tzSaving} disabled={timezone === shop.timezone} onPress={() => void saveTimezone()} style={styles.selfStart} />
      </Card>

      <Card>
        <SectionHeading title="Receipt details" text="Printed on every sale, agreement and payment receipt, together with your shop name, address, phone and email." />
        <Alert text={receiptError} />
        <Alert kind="success" text={receiptMessage} />
        <Field label="NTN (National Tax Number)" optional value={receipt.ntn} onChangeText={v => setReceipt(r => ({ ...r, ntn: v }))} ltr maxLength={30} autoCapitalize="characters" />
        <Field label="STRN (Sales Tax Registration Number)" optional value={receipt.strn} onChangeText={v => setReceipt(r => ({ ...r, strn: v }))} ltr maxLength={30} autoCapitalize="characters" />
        <Field label="Receipt terms" optional="Optional · e.g. return, exchange and warranty policy" value={receipt.receiptNote} onChangeText={v => setReceipt(r => ({ ...r, receiptNote: v }))} multiline maxLength={1000} />
        <Button title={t(receiptSaving ? 'Saving...' : 'Save')} small loading={receiptSaving} onPress={() => void saveReceipt()} style={styles.selfStart} />
      </Card>

      <Card tone="cream">
        <SectionHeading title="Shop code for the mobile app" text="In the Bizora Pilot app, employees choose “Employee” and enter this shop code with their employee ID and password." />
        <Txt variant="h1" ltr style={styles.code}>{shop.shopCode ?? t('Not assigned yet')}</Txt>
        {shop.shopCode ? <Button title={t(copied === 'code' ? 'Copied ✓' : 'Copy code')} small onPress={() => void copy(shop.shopCode!, 'code')} style={styles.selfStart} /> : null}
      </Card>

      <Card>
        <SectionHeading title="Employee login link" text={t('Employees sign in here with their employee ID and password. This link is unique to {shop}.', { shop: shop.shopName })} />
        <Txt variant="code" ltr style={styles.link}>{loginPath}</Txt>
        <Txt variant="small" style={styles.linkHint}>{t('Add your web app’s address in front, e.g. https://your-site.com{path}.', { path: loginPath })}</Txt>
        <Button title={t(copied === 'link' ? 'Copied ✓' : 'Copy link path')} variant="outline" small onPress={() => void copy(loginPath, 'link')} style={styles.selfStart} />
      </Card>

      <Card>
        <SectionHeading title="Employees" text="Create employee accounts and manage who can sign in to your shop." />
        <QuickLink icon="people-outline" title="Your team" text="Accounts, roles and temporary passwords" tone="violet" onPress={() => router.push('/account/employees')} />
      </Card>

      <LogoutCard />
    </Screen>
  );
}

function EmployeeAccount() {
  const { t } = useFormat();
  const session = useSession();
  if (session?.role !== 'employee') return null;
  const { employee, shop } = session;
  return (
    <Screen eyebrow="ACCOUNT" title={employee.name} rawTitle subtitle={`${employee.employeeId} · ${employee.role} · ${t(employee.accessRole === 'manager' ? 'Manager' : 'Employee')}`} rawSubtitle>
      <Card tone="ink">
        <View style={styles.banner}>
          <View style={styles.avatar}><Txt variant="h1" color={colors.goldText}>{shop.shopName.charAt(0).toUpperCase()}</Txt></View>
          <View style={styles.bannerText}>
            <Txt variant="eyebrow" color={colors.onInkMuted}>{t(employee.accessRole === 'manager' ? 'MANAGER' : 'EMPLOYEE')}</Txt>
            <Txt variant="h2" color={colors.onInk}>{shop.shopName}</Txt>
            <Txt variant="small" color={colors.onInkMuted}>{t(employee.accessRole === 'manager' ? 'BIZORA PILOT · MANAGER' : 'BIZORA PILOT · EMPLOYEE')}</Txt>
          </View>
        </View>
      </Card>
      <Card>
        <FactGrid>
          <Fact label="EMPLOYEE ID" value={employee.employeeId} ltr />
          <Fact label="ROLE" value={employee.role} />
          <Fact label="EMAIL" value={employee.email} ltr flex />
        </FactGrid>
        <QuickLink icon="key-outline" title="Change password" text="Choose a password only you know." onPress={() => router.push('/account/password')} />
      </Card>
      <LogoutCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  bannerText: { flex: 1, gap: 2 },
  selfStart: { alignSelf: 'flex-start' },
  code: { color: colors.goldText, letterSpacing: 4, marginBottom: space.md },
  link: { color: colors.goldText, marginBottom: 6 },
  linkHint: { marginBottom: space.md },
  row: { flexDirection: 'row', gap: 8, marginTop: space.sm },
  server: { marginTop: space.lg, gap: 2 },
  logout: { marginTop: space.lg }
});
