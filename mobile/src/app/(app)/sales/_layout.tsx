import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '@/theme';

/** Sales pages: the lists (full price, installments, history), one sale, one installment agreement. */
export default function SalesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="installments/[id]" />
    </Stack>
  );
}
