import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../state/app-context';
import { colors } from '../ui/theme';

void SplashScreen.preventAutoHideAsync();

function Root() {
  const { ready } = useApp();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="shop/[id]" options={{ title: 'Shop' }} />
      <Stack.Screen name="order/new" options={{ title: 'Create order' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Queries read the phone's SQLite, not the network: they must run offline too
  // (networkMode 'always' — TanStack would otherwise pause them while the device is offline).
  // No retries; they refetch when a sync invalidates them.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 30_000, networkMode: 'always' },
          mutations: { networkMode: 'always' },
        },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <AppProvider>
          <StatusBar style="light" />
          <Root />
        </AppProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
