import React from 'react';
import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
