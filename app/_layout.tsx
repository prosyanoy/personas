import React from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '@/state/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Syne_600SemiBold,
  Syne_700Bold,
  Syne_800ExtraBold,
} from '@expo-google-fonts/syne';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';

import { restoreModel } from '@/llm/model';
import { OnboardingProvider } from '@/state/onboarding';
import { colors } from '@/theme/tokens';

const queryClient = new QueryClient();

function AuthenticatedRoutes() {
  const { user, loading, error, retry } = useAuth();
  if (loading || error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16, backgroundColor: colors.canvas }}>
        {loading ? <ActivityIndicator color={colors.brand} /> : <>
          <Text>{error}</Text>
          <Pressable accessibilityRole="button" onPress={retry} style={{ padding: 16 }}>
            <Text style={{ color: colors.brand }}>Retry session check</Text>
          </Pressable>
        </>}
      </View>
    );
  }
  return (
    <OnboardingProvider key={user?.id ?? 'signed-out'}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={!user}>
          <Stack.Screen name="auth" />
        </Stack.Protected>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="support" />
        </Stack.Protected>
        <Stack.Protected guard={!!user?.onboardingCompleted}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
    </OnboardingProvider>
  );
}

export default function RootLayout() {

  React.useEffect(() => {
    void restoreModel();
  }, []);

  const [fontsLoaded] = useFonts({
    Syne_600SemiBold,
    Syne_700Bold,
    Syne_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthenticatedRoutes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
