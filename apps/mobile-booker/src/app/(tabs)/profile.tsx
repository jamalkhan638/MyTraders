import { ScrollView, Text, View } from 'react-native';
import { useApp, useSession } from '../../state/app-context';
import { useSyncCounts } from '../../state/local-queries';
import { Button, Card, LastSynced, styles } from '../../ui/components';
import { confirmDialog } from '../../ui/dialog';
import { Page } from '../../ui/page';
import { colors } from '../../ui/theme';

export default function ProfileScreen() {
  const { user } = useSession();
  const { signOut, syncNow, syncing, online } = useApp();
  const counts = useSyncCounts().data;
  const unsent = (counts?.pending ?? 0) + (counts?.failed ?? 0) + (counts?.failedRetrying ?? 0);

  const confirmLogout = () =>
    confirmDialog(
      'Log out?',
      unsent > 0
        ? `${unsent} order${unsent === 1 ? ' is' : 's are'} not sent yet. They stay safely on this phone and will sync the next time you sign in.`
        : 'Shops and products saved on this phone will be removed.',
      'Log out',
      () => void signOut(),
      true,
    );

  return (
    <Page>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
        <Card style={{ gap: 12 }}>
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row label="Company" value={user.organization?.name ?? '—'} />
          <Row label="Connection" value={online ? 'Online' : 'Offline'} />
          <LastSynced />
        </Card>
        <Button
          title="Sync now"
          icon="refresh-cw"
          onPress={() => void syncNow()}
          loading={syncing}
        />
        <Button
          title="Log out"
          icon="log-out"
          variant="outline"
          onPress={confirmLogout}
          testID="logout"
        />
        <Text style={[styles.muted, { textAlign: 'center', fontSize: 12 }]}>
          SupplyBeacon Booker · version 1.0.0{'\n'}To change your password, ask your office admin.
        </Text>
      </ScrollView>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{value}</Text>
    </View>
  );
}
