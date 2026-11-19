import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import React, { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { colors } from '@/theme';
import { URDU_FONT } from '@/ui/fonts';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (active: IconName, inactive: IconName) => ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) =>
  <Ionicons name={focused ? active : inactive} size={size} color={String(color)} />;

/**
 * The signed-in app: the same four tabs for owners and employees; each screen shows only what
 * the signed-in role may do. An employee with a temporary password only gets the Account tab
 * until they choose their own password.
 */
export default function AppLayout() {
  const { t, isRtl } = useI18n();
  const insets = useSafeAreaInsets();
  const { session, mustChangePassword, isManager, refreshProfile } = useAuth();

  // Pick up changes made elsewhere (shop settings, role, temp-password flag) on launch.
  useEffect(() => { refreshProfile().catch(() => undefined); }, [refreshProfile]);

  // Signed out (logout, expiry, revoked token): back to the landing page.
  if (!session) return <Redirect href="/" />;

  const employee = session.role === 'employee';
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.goldText,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: colors.border, ...(isRtl ? { height: 64 + insets.bottom } : null) },
        tabBarLabelStyle: isRtl ? { fontFamily: URDU_FONT.bold, fontSize: 11, lineHeight: 22 } : { fontSize: 11, fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.cream }
      }}
    >
      <Tabs.Protected guard={!mustChangePassword}>
        <Tabs.Screen name="home" options={{ title: t(employee && !isManager ? 'My summary' : 'Overview'), tabBarIcon: icon('home', 'home-outline') }} />
        <Tabs.Screen name="inventory" options={{ title: t('Inventory'), tabBarIcon: icon('cube', 'cube-outline') }} />
        <Tabs.Screen name="sales" options={{ title: t('Sales'), tabBarIcon: icon('receipt', 'receipt-outline') }} />
        <Tabs.Screen name="customers" options={{ title: t('Customers'), tabBarIcon: icon('people', 'people-outline') }} />
      </Tabs.Protected>
      <Tabs.Screen name="account" options={{ title: t(employee ? 'Account' : 'Shop profile'), tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
