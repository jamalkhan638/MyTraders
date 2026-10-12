import { Feather } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { ApiError, NetworkError } from '../api/errors';
import { useApp } from '../state/app-context';
import { Button, Card, Field } from '../ui/components';
import { colors } from '../ui/theme';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export default function LoginScreen() {
  const { user, signIn, signedOutReason } = useApp();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  if (user) return <Redirect href="/" />;

  const submit = form.handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? 'No internet connection. Connect to sign in for the first time.'
          : e instanceof ApiError
            ? e.message
            : 'Could not sign in. Please try again.',
      );
    }
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, gap: 20 }}
        >
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Image
              source={require('../../assets/icon.png')}
              style={{ width: 72, height: 72, borderRadius: 16 }}
            />
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>
              SupplyBeacon Booker
            </Text>
            <Text style={{ color: colors.muted }}>Book shop orders — online or offline</Text>
          </View>
          {signedOutReason ? (
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                padding: 12,
                borderRadius: 10,
                backgroundColor: colors.warningSoft,
              }}
              testID="signed-out-reason"
            >
              <Feather name="info" size={18} color={colors.warning} />
              <Text style={{ color: colors.warning, flex: 1 }}>
                {signedOutReason} Orders saved on this phone are kept and will sync after you sign
                in.
              </Text>
            </View>
          ) : null}
          <Card style={{ gap: 16 }}>
            <Controller
              control={form.control}
              name="email"
              render={({ field, fieldState }) => (
                <Field
                  label="Email"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@company.com"
                  error={fieldState.error?.message}
                  testID="email"
                />
              )}
            />
            <Controller
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <Field
                  label="Password"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  secureTextEntry
                  autoComplete="password"
                  placeholder="Password"
                  error={fieldState.error?.message}
                  onSubmitEditing={() => void submit()}
                  testID="password"
                />
              )}
            />
            {error ? (
              <Text style={{ color: colors.danger }} testID="login-error">
                {error}
              </Text>
            ) : null}
            <Button
              title="Login"
              onPress={() => void submit()}
              loading={form.formState.isSubmitting}
              testID="login"
            />
          </Card>
          <Text style={{ textAlign: 'center', color: colors.muted, fontSize: 12 }}>
            For Order Bookers. Admins use the SupplyBeacon website.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
