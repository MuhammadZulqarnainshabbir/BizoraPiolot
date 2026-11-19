import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { I18nProvider, useI18n } from '@/i18n/I18nContext';
import { colors } from '@/theme';
import { ConfirmProvider, SessionWarningDialog } from '@/ui/dialogs';
import { URDU_FONTS } from '@/ui/fonts';

/**
 * Root layout. Two groups: (auth) for signed-out screens and (app) for the tabbed app. Each
 * group's layout redirects to the other when the session starts or ends.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <ConfirmProvider>
            <Shell />
          </ConfirmProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { ready, noteActivity } = useAuth();
  const i18n = useI18n();
  // The Urdu typeface; if it fails to load the app still starts, with the system font.
  const [fontsLoaded, fontError] = useFonts(URDU_FONTS);

  if (!ready || !i18n.ready || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    // Every touch counts as activity for the session's inactivity limit.
    <View style={styles.root} onTouchStart={noteActivity}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: styles.content }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
      <SessionWarningDialog />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { backgroundColor: colors.cream },
  splash: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }
});
