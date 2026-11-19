import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '@/theme';

/** Inventory pages: unit list, stock by product, add stock, unit details and the two "Mark as sold" forms. */
export default function InventoryLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="products" />
      <Stack.Screen name="add" />
      <Stack.Screen name="units/[unitId]" />
      <Stack.Screen name="sell/full-price/[unitId]" />
      <Stack.Screen name="sell/installment/[unitId]" />
    </Stack>
  );
}
