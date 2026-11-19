import { router } from 'expo-router';
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { inventory } from '@/api/endpoints';
import type { Product } from '@/api/models';
import { useAuth } from '@/auth/AuthContext';
import { useFormat } from '@/hooks/useFormat';
import { usePagedList } from '@/hooks/usePagedList';
import { colors, space } from '@/theme';
import { Button } from '@/ui/Button';
import { Screen, screenStyles } from '@/ui/Screen';
import { SearchBar } from '@/ui/SearchBar';
import { Select } from '@/ui/Select';
import { Txt } from '@/ui/Txt';
import { Alert, Badge, Card, EmptyState, ListFooter, Loading } from '@/ui/primitives';

const SORT_OPTIONS = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Product A–Z' },
  { value: 'brand:asc', label: 'Brand A–Z' }
];

/** The catalog: each product model with its unit counts. */
export default function ProductsScreen() {
  const { t } = useFormat();
  const { can } = useAuth();
  const list = usePagedList<Product>(query => inventory.products(query), { sort: 'updatedAt:desc', fallback: 'Unable to load products. Please try again.' }, []);

  const header = (
    <View>
      <Alert text={list.error} />
      <SearchBar value={list.searchInput} onChange={list.setSearchInput} placeholder="Name, brand, model, code" />
      <Select compact value={list.sort} options={SORT_OPTIONS} onChange={list.setSort} style={styles.sort} />
      <Txt variant="small" style={styles.count}>{list.total === 1 ? t('1 product') : t('{count} products', { count: list.total })}</Txt>
      {list.loading && !list.loaded ? <Loading /> : null}
    </View>
  );

  return (
    <Screen scroll={false} back eyebrow="INVENTORY" title="Stock by product" subtitle="Your catalog, with units available and sold."
      right={can('inventory.add') ? <Button title={t('＋ Add')} small onPress={() => router.push('/inventory/add')} /> : undefined}>
      <FlatList
        data={list.items}
        keyExtractor={p => p._id}
        contentContainerStyle={screenStyles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.gold} />}
        onEndReachedThreshold={0.4}
        onEndReached={list.loadMore}
        renderItem={({ item: p }) => {
          const stock = p.stock ?? { AVAILABLE: 0, SOLD_FULL_PRICE: 0, SOLD_INSTALLMENT: 0 };
          return (
            <Card style={styles.card}>
              <View style={styles.top}>
                <View style={styles.body}>
                  <Txt bold numberOfLines={2}>{p.name}</Txt>
                  <Txt variant="small">{p.brand} · {p.model} · <Txt variant="small" ltr>{p.productCode}</Txt></Txt>
                  {p.category ? <Txt variant="small">{t(p.category)}{p.subCategory ? ` · ${t(p.subCategory)}` : ''}</Txt> : null}
                </View>
                <Badge label={stock.AVAILABLE === 1 ? '1 available' : '{count} available'} tone={stock.AVAILABLE ? 'green' : 'grey'} />
              </View>
              <Txt variant="small" style={styles.counts}>{t('Available')}: {stock.AVAILABLE} · {t('Sold at full price')}: {stock.SOLD_FULL_PRICE} · {t('Sold on installment')}: {stock.SOLD_INSTALLMENT}</Txt>
              <View style={styles.actions}>
                <Button title={t('View units')} variant="outline" small onPress={() => router.push({ pathname: '/inventory', params: { productId: p._id, productName: p.name } })} />
                {can('inventory.add') ? <Button title={t('Add units')} small onPress={() => router.push({ pathname: '/inventory/add', params: { productId: p._id } })} /> : null}
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={list.loaded && !list.loading ? (
          <EmptyState icon="albums-outline" title={list.searchTerm ? 'No matching products' : 'Your catalog is empty'} text={list.searchTerm ? 'Try a different search or filter.' : 'Add products with their serial numbers to start your inventory.'} />
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
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  body: { flex: 1 },
  counts: { marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }
});
