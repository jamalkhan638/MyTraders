import { type ReactNode } from 'react';
import { View } from 'react-native';
import { ConnectivityBanner } from './components';
import { colors } from './theme';

/** Screen body: the offline / sync banner on top, then the content. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ConnectivityBanner />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
