import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { customers } from '@/api/endpoints';
import type { CustomerRecord } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { usePagedList } from '@/hooks/usePagedList';
import { colors, radius, space } from '@/theme';
import { Button } from '@/ui/Button';
import { Screen, screenStyles } from '@/ui/Screen';
import { SearchBar } from '@/ui/SearchBar';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { Alert, Badge, Card, EmptyState, ListFooter, Loading } from '@/ui/primitives';

const SORT_OPTIONS = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' }
];

/** Every customer of the shop, searchable by name, phone, CNIC or code. */
export default function CustomersScreen() {
  const { t, date } = useFormat();
  const { can } = useAuth();
  const params = useLocalSearchParams<{ search?: string }>();
  const list = usePagedList<CustomerRecord>(query => customers.list(query), { sort: 'updatedAt:desc', fallback: 'Unable to load customers. Please try again.' }, []);
  useEffect(() => { if (params.search !== undefined) list.setSearchInput(params.search); }, [params.search]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <View>
      <Alert text={list.error} />
      <SearchBar value={list.searchInput} onChange={list.setSearchInput} placeholder="Name, phone, CNIC or code" />
      <Select compact value={list.sort} options={SORT_OPTIONS} onChange={list.setSort} style={styles.sort} />
      <Txt variant="small" style={styles.count}>{list.searchTerm
        ? (list.total === 1 ? t('1 customer matching “{search}”', { search: list.searchTerm }) : t('{count} customers matching “{search}”', { count: list.total, search: list.searchTerm }))
        : (list.total === 1 ? t('1 customer') : t('{count} customers', { count: list.total }))}</Txt>
      {list.loading && !list.loaded ? <Loading text="Loading customers..." /> : null}
    </View>
  );

  return (
    <Screen scroll={false} eyebrow="CUSTOMERS" title="Customers" subtitle="Everyone who has bought from your shop, with their ID details and purchase history."
      right={can('customers.manage') ? <Button title={t('＋ Add')} small onPress={() => router.push('/customers/new')} /> : undefined}>
      <FlatList
        data={list.items}
        keyExtractor={c => c._id}
        contentContainerStyle={screenStyles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.gold} />}
        onEndReachedThreshold={0.4}
        onEndReached={list.loadMore}
        renderItem={({ item: c }) => (
          <Card style={styles.card}>
            <View style={styles.top}>
              <View style={styles.avatar}><Txt bold color={colors.goldText}>{c.name.charAt(0).toUpperCase()}</Txt></View>
              <View style={styles.body}>
                <Txt bold numberOfLines={1} onPress={() => router.push(`/customers/${c._id}`)}>{c.name}</Txt>
                <Txt variant="small" ltr>{c.customerCode} · {c.phone}</Txt>
                <Txt variant="small" ltr>{c.cnicFormatted ? `${t('CNIC')} ${c.cnicFormatted}` : t('None')}{c.address ? ` · ${c.address}` : ''}</Txt>
              </View>
              <View style={styles.right}>
                <Badge label={c.documents.length === 1 ? '1 picture' : c.documents.length ? '{count} pictures' : 'No ID pictures yet.'} tone={c.documents.length ? 'green' : 'grey'} />
                <Txt variant="small">{date(c.createdAt)}</Txt>
              </View>
            </View>
            <View style={styles.actions}>
              <Button title={t('View')} variant="outline" small onPress={() => router.push(`/customers/${c._id}`)} />
            </View>
          </Card>
        )}
        ListEmptyComponent={list.loaded && !list.loading ? (
          <EmptyState icon="people-outline" title={list.searchTerm ? 'No matching customers' : 'No customers yet'} text={list.searchTerm ? 'Try a different name, phone or CNIC.' : 'Customers are added here, or automatically when you record an installment sale.'}
            action={!list.searchTerm && can('customers.manage') ? <Button title={t('Add a customer')} small onPress={() => router.push('/customers/new')} /> : undefined} />
        ) : undefined}
        ListFooterComponent={<ListFooter shown={list.items.length} total={list.total} loadingMore={list.loadingMore} hasMore={list.page < list.totalPages} onLoadMore={list.loadMore} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sort: { marginBottom: space.sm },
  count: { marginBottom: space.sm },
  card: { marginBottom: space.md, padding: 14 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }
});
