import { Feather } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { discardOrder, retryNow } from '../../db/repo';
import { unitShort } from '../../orders/book';
import { useApp, useSession } from '../../state/app-context';
import { useOrder } from '../../state/local-queries';
import {
  Button,
  Card,
  Empty,
  formatDate,
  formatTime,
  StatusText,
  styles,
  SyncBadge,
} from '../../ui/components';
import { confirmDialog } from '../../ui/dialog';
import { Page } from '../../ui/page';
import { colors } from '../../ui/theme';

/** One local order: its sync state, lines, and Retry / Correct / Discard when it failed. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, owner } = useSession();
  const { syncNow, orderSaved } = useApp();
  const order = useOrder(id);

  if (order.isPending) return <Page>{null}</Page>;
  if (!order.data)
    return (
      <Page>
        <Empty icon="file" text="Order not found on this phone." />
      </Page>
    );
  const o = order.data;
  const fixable = o.status === 'FAILED' && !o.retryable;

  const retry = async () => {
    await retryNow(db, owner, o.localId, Date.now());
    if (!(await orderSaved())) await syncNow();
  };
  const discard = () =>
    confirmDialog(
      'Discard this order?',
      'It was never accepted by the server and will be deleted from this phone.',
      'Discard',
      () =>
        void discardOrder(db, owner, o.localId)
          .then(() => orderSaved())
          .then(() => router.back()),
      true,
    );

  return (
    <Page>
      <Stack.Screen options={{ title: o.label }} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <Card style={{ gap: 8 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 20, fontWeight: '800' }} testID="order-label">
              {o.label}
            </Text>
            <SyncBadge status={o.status} retrying={o.retryable} />
          </View>
          <Text style={{ fontSize: 16, color: colors.text }}>{o.shopName}</Text>
          <Text style={styles.muted}>
            {o.areaName} · booked {formatDate(o.createdAt)}, {formatTime(o.createdAt)}
          </Text>
          {o.serverNumber ? (
            <Text style={styles.muted}>
              Server order {o.serverNumber}
              {o.syncedAt ? ` · synced ${formatTime(o.syncedAt)}` : ''}
            </Text>
          ) : (
            <Text style={styles.muted}>
              Saved on this phone (Local-{String(o.localNumber).padStart(3, '0')})
            </Text>
          )}
          {o.serverStatus ? <StatusText status={o.serverStatus} /> : null}
        </Card>

        {o.status === 'FAILED' && o.lastError ? (
          <Card
            style={{
              borderColor: colors.danger,
              backgroundColor: colors.dangerSoft,
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <Feather name="alert-circle" size={18} color={colors.danger} />
            <Text style={{ color: colors.danger, flex: 1 }} testID="order-error">
              {o.lastError}
            </Text>
          </Card>
        ) : null}
        {o.status === 'PENDING_SYNC' ? (
          <Text style={styles.muted}>Will be sent automatically when the phone is online.</Text>
        ) : null}

        <Card style={{ gap: 8 }}>
          <Text style={styles.title}>Products ({o.items.length})</Text>
          {o.items.map((i) => (
            <View
              key={i.productId}
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text style={{ flex: 1, color: colors.text }}>{i.productName}</Text>
              <Text style={{ fontWeight: '700' }}>
                {i.quantity} {unitShort(i.productType)}
              </Text>
            </View>
          ))}
        </Card>

        {o.status === 'FAILED' ? (
          <Button
            title="Retry sync"
            icon="refresh-cw"
            onPress={() => void retry()}
            testID="retry"
          />
        ) : null}
        {fixable ? (
          <>
            <Button
              title="Correct the order"
              icon="edit-2"
              variant="outline"
              onPress={() =>
                router.push({ pathname: '/order/new', params: { localId: o.localId } })
              }
              testID="correct"
            />
            <Button title="Discard" icon="trash-2" variant="ghost" onPress={discard} />
          </>
        ) : null}
      </ScrollView>
    </Page>
  );
}
