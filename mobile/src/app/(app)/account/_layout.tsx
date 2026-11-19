import { Stack } from 'expo-router';
import React from 'react';
import { useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme';

/**
 * Account pages. An employee signed in with a temporary password can only reach "Change
 * password" until they've chosen their own (the server enforces the same).
 */
export default function AccountLayout() {
  const { mustChangePassword } = useAuth();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
      <Stack.Protected guard={!mustChangePassword}>
        <Stack.Screen name="index" />
        <Stack.Screen name="employees" />
      </Stack.Protected>
      <Stack.Screen name="password" />
    </Stack>
  );
}
