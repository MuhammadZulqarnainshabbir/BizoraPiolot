import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { customers } from '@/api/endpoints';
import { useLoad } from '@/hooks/useLoad';
import { Screen } from '@/ui/Screen';
import { CustomerForm } from '@/ui/CustomerForm';
import { Alert, Loading } from '@/ui/primitives';

/** Edit a customer's details. Past sales keep the details they were recorded with. */
export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useLoad(() => customers.get(id), [id], 'Unable to load this customer.');
  return (
    <Screen back eyebrow="CUSTOMERS" title="Edit customer" subtitle="Update the details; past sales keep the details they were recorded with.">
      <Alert text={load.error} />
      {load.loading && !load.data ? <Loading /> : null}
      {load.data ? <CustomerForm initial={load.data.customer} onSaved={() => router.back()} /> : null}
    </Screen>
  );
}
