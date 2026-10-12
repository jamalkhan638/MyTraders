import { Alert, Platform } from 'react-native';

/** Yes / no question: native dialog on the phone, browser confirm in the web preview. */
export function confirmDialog(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void,
  destructive = false,
) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/** Information only. */
export function infoDialog(title: string, message: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
