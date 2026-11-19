import { router } from 'expo-router';
import React from 'react';
import { Screen } from '@/ui/Screen';
import { CustomerForm } from '@/ui/CustomerForm';

/** Add a customer; opens their page afterwards so ID pictures can be added. */
export default function NewCustomerScreen() {
  return (
    <Screen back eyebrow="CUSTOMERS" title="Add customer" subtitle="Name and phone are required. Add the CNIC and ID pictures for installment customers.">
      <CustomerForm onSaved={customer => router.replace(`/customers/${customer._id}`)} />
    </Screen>
  );
}
