import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useApp } from '../../state/app-context';
import { useAreas, useShops } from '../../state/local-queries';
import { Card, Chip, Empty, LastSynced, SearchBox, styles } from '../../ui/components';
import { Page } from '../../ui/page';
import { colors } from '../../ui/theme';

/** My Shops — the booker's assigned shops from the phone's cache (works offline). */
export default function ShopsScreen() {
  const { syncNow, syncing, online } = useApp();
  const [q, setQ] = useState('');
  const [areaId, setAreaId] = useState<string | undefined>();
  const shops = useShops({ q, areaId });
  const areas = useAreas();

  return (
    <Page>
      <FlatList
        data={shops.data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 14, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => void syncNow()}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <SearchBox
              placeholder="Search shop"
              value={q}
              onChangeText={setQ}
              testID="shop-search"
            />
            {(areas.data?.length ?? 0) > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                <Chip label="All areas" active={!areaId} onPress={() => setAreaId(undefined)} />
                {areas.data!.map((a) => (
                  <Chip
                    key={a.id}
                    label={`${a.name} (${a.shopCount})`}
                    active={areaId === a.id}
                    onPress={() => setAreaId(a.id)}
                  />
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.muted}>
                {shops.data?.length ?? 0} shop{shops.data?.length === 1 ? '' : 's'}
              </Text>
              <LastSynced />
            </View>
          </View>
        }
        ListEmptyComponent={
          shops.isPending ? null : (
            <Empty
              icon="shopping-bag"
              text={
                q || areaId
                  ? 'No shops match.'
                  : online
                    ? 'No shops assigned to you yet. Pull down to refresh.'
                    : 'No shops saved on this phone yet. Connect to the internet once to download them.'
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/shop/${item.id}`)} testID={`shop-${item.name}`}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                  {item.name}
                </Text>
                <Text style={{ color: colors.primary, fontWeight: '500' }}>{item.areaName}</Text>
                {item.address ? <Text style={styles.muted}>{item.address}</Text> : null}
                {item.phone ? <Text style={styles.muted}>{item.phone}</Text> : null}
              </View>
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </Card>
          </Pressable>
        )}
      />
    </Page>
  );
}
