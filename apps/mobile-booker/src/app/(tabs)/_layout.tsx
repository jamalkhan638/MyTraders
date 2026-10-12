import { Feather } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useApp } from '../../state/app-context';
import { useSyncCounts } from '../../state/local-queries';
import { colors } from '../../ui/theme';

function useOrdersBadge() {
  const counts = useSyncCounts().data;
  const n = (counts?.pending ?? 0) + (counts?.failed ?? 0) + (counts?.failedRetrying ?? 0);
  return n > 0 ? n : undefined;
}

export default function TabsLayout() {
  const { user } = useApp();
  if (!user) return <Redirect href="/login" />;
  return <SignedInTabs />;
}

function SignedInTabs() {
  const badge = useOrdersBadge();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarStyle: { height: 62, paddingBottom: 8, paddingTop: 6 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Shops',
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'My Orders',
          tabBarBadge: badge,
          tabBarIcon: ({ color, size }) => <Feather name="list" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
