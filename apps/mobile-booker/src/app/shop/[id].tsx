import { Feather } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useDraft, useShop } from '../../state/local-queries';
import { Button, Card, Empty, styles } from '../../ui/components';
import { Page } from '../../ui/page';
import { colors } from '../../ui/theme';

export default function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shop = useShop(id);
  const draft = useDraft(id);
  if (shop.isPending) return <Page>{null}</Page>;
  if (!shop.data) {
    return (
      <Page>
        <Empty icon="slash" text="This shop is no longer in your list." />
      </Page>
    );
  }
  const s = shop.data;
  return (
    <Page>
      <Stack.Screen options={{ title: s.name }} />
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{s.name}</Text>
          <Line icon="map-pin" text={s.areaName} />
          {s.address ? <Line icon="home" text={s.address} /> : null}
          {s.phone ? <Line icon="phone" text={s.phone} /> : null}
          {s.contactPerson ? <Line icon="user" text={s.contactPerson} /> : null}
        </Card>
        <Button
          title={draft.data ? 'Continue draft order' : 'Create Order'}
          icon="plus-circle"
          onPress={() => router.push({ pathname: '/order/new', params: { shopId: s.id } })}
          testID="create-order"
        />
        {draft.data ? (
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            A draft with {draft.data.items.length} product{draft.data.items.length === 1 ? '' : 's'}{' '}
            is saved on this phone.
          </Text>
        ) : null}
      </ScrollView>
    </Page>
  );
}

function Line({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Feather name={icon} size={16} color={colors.muted} />
      <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{text}</Text>
    </View>
  );
}
