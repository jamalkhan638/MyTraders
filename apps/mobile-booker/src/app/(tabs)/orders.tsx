import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { type MyOrderRow } from '../../db/repo';
import { useApp } from '../../state/app-context';
import { useMyOrders, useSyncCounts } from '../../state/local-queries';
import {
  Button,
  Card,
  Empty,
  formatDate,
  LastSynced,
  StatusText,
  styles,
  SyncBadge,
} from '../../ui/components';
import { Page } from '../../ui/page';
import { colors } from '../../ui/theme';

/** My Orders + Sync Center: local orders (any sync state) and server orders, each shown once. */
export default function OrdersScreen() {
  const { syncNow, syncing } = useApp();
  const orders = useMyOrders();
  const counts = useSyncCounts().data;

  return (
    <Page>
      <FlatList
        data={orders.data ?? []}
        keyExtractor={(r) => (r.kind === 'local' ? r.order.localId : r.order.id)}
        contentContainerStyle={{ padding: 14, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={syncing}
            onRefresh={() => void syncNow()}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <Card style={{ gap: 10, marginBottom: 4 }}>
            <Text style={styles.title}>Sync center</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Stat
                label="Pending"
                value={(counts?.pending ?? 0) + (counts?.failedRetrying ?? 0)}
                color={colors.warning}
                testID="count-pending"
              />
              <Stat
                label="Failed"
                value={counts?.failed ?? 0}
                color={colors.danger}
                testID="count-failed"
              />
            </View>
            <LastSynced />
            <Button
              title="Sync now"
              icon="refresh-cw"
              onPress={() => void syncNow()}
              loading={syncing}
              testID="sync-now"
            />
          </Card>
        }
        ListEmptyComponent={
          orders.isPending ? null : (
            <Empty icon="file-text" text="No orders yet. Open a shop to book one." />
          )
        }
        renderItem={({ item }) => <OrderRow row={item} />}
      />
    </Page>
  );
}

function Stat({
  label,
  value,
  color,
  testID,
}: {
  label: string;
  value: number;
  color: string;
  testID: string;
}) {
  return (
    <View
      style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: colors.bg }}
      testID={testID}
    >
      <Text style={{ fontSize: 22, fontWeight: '800', color: value > 0 ? color : colors.text }}>
        {value}
      </Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function OrderRow({ row }: { row: MyOrderRow }) {
  if (row.kind === 'server') {
    const o = row.order;
    return (
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{o.orderNumber}</Text>
          <SyncBadge status="SYNCED" />
        </View>
        <Text style={{ color: colors.text }}>{o.shopName}</Text>
        <Text style={styles.muted}>
          {formatDate(o.createdAt)} · {o.itemCount} product{o.itemCount === 1 ? '' : 's'}
        </Text>
        <StatusText status={o.status} />
      </Card>
    );
  }
  const o = row.order;
  return (
    <Pressable onPress={() => router.push(`/order/${o.localId}`)} testID={`order-${o.label}`}>
      <Card style={{ gap: 4 }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{o.label}</Text>
          <SyncBadge status={o.status} retrying={o.retryable} />
        </View>
        <Text style={{ color: colors.text }}>{o.shopName}</Text>
        <Text style={styles.muted}>
          {formatDate(o.createdAt)} · {o.items.length} product{o.items.length === 1 ? '' : 's'}
        </Text>
        {o.serverStatus ? (
          <StatusText status={o.serverStatus} />
        ) : (
          <Text style={{ color: colors.muted, fontSize: 12 }}>Saved on this phone</Text>
        )}
        {o.status === 'FAILED' && o.lastError ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            <Feather name="alert-circle" size={14} color={colors.danger} />
            <Text style={{ color: colors.danger, flex: 1, fontSize: 13 }}>{o.lastError}</Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}
