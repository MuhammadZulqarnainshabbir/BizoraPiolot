import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme';

/** Signed-out screens: landing, owner and employee sign-in, registration, server settings. A signed-in user is sent to the app. */
export default function AuthLayout() {
  const { signedIn } = useAuth();
  if (signedIn) return <Redirect href="/home" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }} />;
}
