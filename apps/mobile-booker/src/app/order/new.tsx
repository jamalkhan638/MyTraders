import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import {
  discardOrder,
  type LocalOrderLine,
  type LocalProduct,
  type LocalShop,
  saveOrder,
} from '../../db/repo';
import { bookOrder, bookOrderSchema, unitLabel, unitShort } from '../../orders/book';
import { useApp, useSession } from '../../state/app-context';
import { useDraft, useOrder, useProducts, useShop } from '../../state/local-queries';
import { Button, Card, Empty, SearchBox, styles } from '../../ui/components';
import { confirmDialog, infoDialog } from '../../ui/dialog';
import { Page } from '../../ui/page';
import { colors } from '../../ui/theme';

const OFFLINE_SAVED = 'Order saved on this device and will sync when internet is available.';

/**
 * Create Order — works fully from the phone's product cache. Quantities only (no prices,
 * D-24): TIN in pieces, POUCH in cartons. The order in progress is kept as a DRAFT on the phone
 * (survives the app closing); Submit saves it as PENDING_SYNC, then sends it if online.
 * `?localId=` reopens a permanently failed order to correct it (same clientOrderId).
 */
export default function CreateOrderScreen() {
  const params = useLocalSearchParams<{ shopId?: string; localId?: string }>();
  const editing = useOrder(params.localId ?? '');
  const shopId = params.shopId ?? editing.data?.shopId ?? '';
  const shop = useShop(shopId);
  const draft = useDraft(shopId);

  const loading = shop.isPending || (params.localId ? editing.isPending : draft.isPending);
  if (loading) return <Page>{null}</Page>;
  if (!shop.data) {
    return (
      <Page>
        <Empty icon="slash" text="This shop is not in your list any more." />
      </Page>
    );
  }
  // start from the failed order being corrected, the saved draft, or an empty order
  const start = params.localId ? editing.data : draft.data;
  return (
    <OrderEditor
      key={start?.localId ?? 'new'}
      shop={shop.data}
      correcting={Boolean(params.localId)}
      initialLines={start?.items ?? []}
      initialLocalId={start?.localId ?? null}
    />
  );
}

function OrderEditor({
  shop,
  correcting,
  initialLines,
  initialLocalId,
}: {
  shop: LocalShop;
  correcting: boolean;
  initialLines: LocalOrderLine[];
  initialLocalId: string | null;
}) {
  const { db, owner, user } = useSession();
  const { orderSaved } = useApp();
  const [q, setQ] = useState('');
  const products = useProducts(q);
  const catalog = useProducts('');
  const [lines, setLines] = useState<LocalOrderLine[]>(initialLines);
  const [localId, setLocalId] = useState<string | null>(initialLocalId);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const touched = useRef(false);

  // keep the order in progress on the phone (DRAFT) so nothing typed is lost
  useEffect(() => {
    if (!touched.current || correcting) return;
    const t = setTimeout(() => {
      void (async () => {
        if (lines.length === 0) {
          if (localId) await discardOrder(db, owner, localId);
          return;
        }
        const id = localId ?? Crypto.randomUUID();
        if (!localId) setLocalId(id);
        await saveOrder(db, {
          owner,
          orgId: user.organization!.id,
          localId: id,
          shop,
          lines,
          notes: null,
          status: 'DRAFT',
          now: Date.now(),
        });
      })().catch(() => undefined); // already submitted: nothing left to keep as draft
    }, 500);
    return () => clearTimeout(t);
  }, [lines, localId, shop, db, owner, user, correcting]);

  const qty = useMemo(() => new Map(lines.map((l) => [l.productId, l.quantity])), [lines]);
  // lines whose product is no longer in the catalog (deactivated since): shown so they can be removed
  const unavailable = useMemo(() => {
    if (!catalog.data) return [];
    const active = new Set(catalog.data.map((p) => p.id));
    return lines.filter((l) => !active.has(l.productId));
  }, [catalog.data, lines]);
  const removeLine = (productId: string) => {
    touched.current = true;
    setError(null);
    setLines((current) => current.filter((l) => l.productId !== productId));
  };

  const setQty = (p: LocalProduct, quantity: number) => {
    setError(null);
    touched.current = true;
    setLines((current) => {
      if (!quantity || quantity < 1) return current.filter((l) => l.productId !== p.id);
      const line = { productId: p.id, productName: p.name, productType: p.type, quantity };
      const index = current.findIndex((l) => l.productId === p.id);
      if (index < 0) return [...current, line];
      const next = [...current];
      next[index] = line;
      return next;
    });
  };

  const submit = () => {
    const parsed = bookOrderSchema.safeParse({ lines });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the quantities');
      return;
    }
    const summary = parsed.data.lines
      .map((l) => `• ${l.productName} — ${l.quantity} ${unitShort(l.productType)}`)
      .join('\n');
    confirmDialog(`Submit order for ${shop.name}?`, summary, 'Submit', () => void save());
  };

  const save = async () => {
    setSaving(true);
    try {
      const id = await bookOrder(
        db,
        { owner, orgId: user.organization!.id, now: Date.now(), uuid: Crypto.randomUUID },
        shop,
        { lines },
        localId ?? undefined,
      );
      const sent = await orderSaved();
      if (!sent) infoDialog('Saved', OFFLINE_SAVED);
      router.replace(`/order/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the order');
    } finally {
      setSaving(false);
    }
  };

  const count = lines.length;

  return (
    <Page>
      <Stack.Screen options={{ title: correcting ? 'Correct order' : shop.name }} />
      <FlatList
        data={products.data ?? []}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 140 }}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            {correcting ? (
              <Text style={{ color: colors.warning }}>Fix the order and submit it again.</Text>
            ) : null}
            {unavailable.map((l) => (
              <Card
                key={l.productId}
                style={{ borderColor: colors.danger, backgroundColor: colors.dangerSoft, gap: 6 }}
              >
                <Text style={{ color: colors.danger, fontWeight: '600' }}>
                  {l.productName} — {l.quantity} {unitShort(l.productType)}
                </Text>
                <Text style={{ color: colors.danger }}>
                  No longer available. Remove it to send this order.
                </Text>
                <Button
                  title="Remove"
                  icon="trash-2"
                  variant="danger"
                  onPress={() => removeLine(l.productId)}
                  testID={`remove-${l.productName}`}
                />
              </Card>
            ))}
            <SearchBox
              placeholder="Search product"
              value={q}
              onChangeText={setQ}
              testID="product-search"
            />
          </View>
        }
        ListEmptyComponent={
          products.isPending ? null : (
            <Empty
              icon="package"
              text={q ? 'No products match.' : 'No products saved on this phone yet.'}
            />
          )
        }
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            quantity={qty.get(item.id) ?? 0}
            onChange={(n) => setQty(item, n)}
          />
        )}
      />
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 14,
          gap: 8,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderColor: colors.border,
        }}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {count > 0 ? (
          <Text style={styles.muted} numberOfLines={2} testID="order-summary">
            {lines
              .map((l) => `${l.productName} × ${l.quantity} ${unitShort(l.productType)}`)
              .join(' · ')}
          </Text>
        ) : null}
        <Button
          title={
            count > 0
              ? `Submit order (${count} product${count === 1 ? '' : 's'})`
              : 'Add products to order'
          }
          icon="send"
          onPress={submit}
          loading={saving}
          disabled={count === 0}
          testID="submit-order"
        />
      </View>
    </Page>
  );
}

function ProductRow({
  product,
  quantity,
  onChange,
}: {
  product: LocalProduct;
  quantity: number;
  onChange: (n: number) => void;
}) {
  return (
    <Card style={[{ gap: 8 }, quantity > 0 && { borderColor: colors.primary }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '600', fontSize: 15, color: colors.text }}>
            {product.name}
          </Text>
          <Text style={styles.muted}>
            {product.type}
            {product.code ? ` · ${product.code}` : ''}
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{unitLabel(product.type)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Step
          icon="minus"
          onPress={() => onChange(Math.max(0, quantity - 1))}
          disabled={quantity === 0}
          label={`Less ${product.name}`}
        />
        <TextInput
          value={quantity ? String(quantity) : ''}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, 6);
            onChange(digits ? Number(digits) : 0);
          }}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.muted}
          style={[styles.input, { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700' }]}
          accessibilityLabel={`${unitLabel(product.type)} ${product.name}`}
          testID={`qty-${product.name}`}
        />
        <Step icon="plus" onPress={() => onChange(quantity + 1)} label={`More ${product.name}`} />
      </View>
    </Card>
  );
}

function Step({
  icon,
  onPress,
  disabled,
  label,
}: {
  icon: 'plus' | 'minus';
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 52,
        height: 48,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: icon === 'plus' ? colors.primary : colors.primarySoft,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Feather name={icon} size={22} color={icon === 'plus' ? '#fff' : colors.primary} />
    </Pressable>
  );
}
