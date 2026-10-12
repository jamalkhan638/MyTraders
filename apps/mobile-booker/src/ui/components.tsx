import { Feather } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { type SyncStatus } from '../db/repo';
import { useApp } from '../state/app-context';
import { OFFLINE_TEXT } from '../sync/controller';
import { colors, radius } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const off = disabled || loading;
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : colors.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.primary },
        variant === 'danger' && { backgroundColor: colors.danger },
        variant === 'outline' && {
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: '#fff',
        },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        (pressed || off) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        icon && <Feather name={icon} size={18} color={variant === 'danger' ? '#fff' : fg} />
      )}
      <Text style={[styles.buttonText, { color: variant === 'danger' ? '#fff' : fg }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...input}
        style={[styles.input, error ? { borderColor: colors.danger } : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function SearchBox(props: TextInputProps) {
  return (
    <View style={styles.search}>
      <Feather name="search" size={18} color={colors.muted} />
      <TextInput
        placeholderTextColor={colors.muted}
        style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 }}
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
    >
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

const SYNC = {
  DRAFT: { label: 'Draft', fg: colors.muted, bg: '#f1f5f9', icon: 'edit-3' },
  PENDING_SYNC: {
    label: 'Pending sync',
    fg: colors.warning,
    bg: colors.warningSoft,
    icon: 'clock',
  },
  SYNCING: { label: 'Syncing…', fg: colors.info, bg: colors.infoSoft, icon: 'refresh-cw' },
  SYNCED: { label: 'Synced', fg: colors.primary, bg: colors.primarySoft, icon: 'check-circle' },
  FAILED: { label: 'Sync failed', fg: colors.danger, bg: colors.dangerSoft, icon: 'alert-circle' },
} as const;

export function SyncBadge({ status, retrying }: { status: SyncStatus; retrying?: boolean }) {
  const s = SYNC[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]} testID={`sync-${status}`}>
      <Feather name={s.icon} size={12} color={s.fg} />
      <Text style={{ color: s.fg, fontSize: 12, fontWeight: '600' }}>
        {status === 'FAILED' && retrying ? 'Retrying soon' : s.label}
      </Text>
    </View>
  );
}

export function StatusText({ status }: { status: string }) {
  const label =
    { PENDING: 'Pending', INVOICED: 'Invoiced', CANCELLED: 'Cancelled' }[status] ?? status;
  return <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>;
}

/** Offline banner + the latest sync notice, shown at the top of every signed-in screen. */
export function ConnectivityBanner() {
  const { online, notice, dismissNotice } = useApp();
  return (
    <View>
      {!online && (
        <View style={[styles.banner, { backgroundColor: '#334155' }]} testID="offline-banner">
          <Feather name="wifi-off" size={16} color="#fff" />
          <Text style={styles.bannerText}>{OFFLINE_TEXT}</Text>
        </View>
      )}
      {notice && notice.kind !== 'session-ended' && (
        <Pressable
          onPress={dismissNotice}
          style={[
            styles.banner,
            {
              backgroundColor:
                notice.kind === 'success'
                  ? colors.primary
                  : notice.kind === 'warning'
                    ? colors.warning
                    : colors.info,
            },
          ]}
        >
          <Feather
            name={
              notice.kind === 'success'
                ? 'check-circle'
                : notice.kind === 'warning'
                  ? 'alert-triangle'
                  : 'refresh-cw'
            }
            size={16}
            color="#fff"
          />
          <Text style={styles.bannerText}>{notice.text}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function LastSynced() {
  const { lastSync, syncing, online } = useApp();
  return (
    <Text style={{ color: colors.muted, fontSize: 12 }} testID="last-synced">
      {syncing
        ? 'Syncing…'
        : lastSync
          ? `Last synced: ${formatTime(lastSync)}`
          : online
            ? 'Not synced yet'
            : 'Not synced yet · offline'}
    </Text>
  );
}

export function Empty({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 40, gap: 10 }}>
      <Feather name={icon} size={28} color={colors.muted} />
      <Text style={{ color: colors.muted, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === today.toDateString()
    ? time
    : `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${time}`;
}

export function formatDate(value: number | string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  button: {
    minHeight: 48,
    borderRadius: radius,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  error: { color: colors.danger, fontSize: 13 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerText: { color: '#fff', flex: 1, fontSize: 14 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted },
});
