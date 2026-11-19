import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '@/theme';

/** Customer records: list, new, one customer (details, ID pictures, history), edit. */
export default function CustomersLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/edit" />
    </Stack>
  );
}
