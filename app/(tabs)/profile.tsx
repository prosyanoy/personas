import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { AppHeader } from '@/components/AppHeader';
import { Glyph } from '@/components/Glyph';
import { PrimaryButton } from '@/components/onboarding';
import { useOnboarding } from '@/state/onboarding';
import { colors, font, radius, spacing } from '@/theme/tokens';

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

export default function Profile() {
  const router = useRouter();
  const { resumeFields, digitalProfile } = useOnboarding();

  const name = resumeFields?.name?.trim() || 'Your profile';
  const title = resumeFields?.title?.trim() ?? null;
  const years = resumeFields?.yearsExperience ?? null;
  const location = resumeFields?.location?.trim() ?? null;
  const skills = resumeFields?.skills ?? [];
  const readiness = digitalProfile?.readiness ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <LinearGradient
            colors={[colors.brand, '#3d7bfa']}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initialsOf(name)}</Text>
          </LinearGradient>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>
            {[title, years != null ? `${years} yrs exp` : null]
              .filter(Boolean)
              .join(' · ') || 'Experience not parsed yet'}
          </Text>
          {location ? (
            <View style={styles.locRow}>
              <Glyph name="location-outline" size={13} color={colors.slate500} />
              <Text style={styles.locText}>{location}</Text>
            </View>
          ) : null}
        </View>

        {skills.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.skillRow}>
              {skills.slice(0, 12).map((s) => (
                <View key={s} style={styles.skill}>
                  <Text style={styles.skillText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {readiness != null ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Interview readiness</Text>
            <View style={styles.readinessRow}>
              <View style={styles.readinessBadge}>
                <Text style={styles.readinessText}>{readiness}%</Text>
              </View>
              <Text style={styles.readinessHint}>
                Based on your digital profile answers — improve it in Discussions.
              </Text>
            </View>
          </View>
        ) : null}

        {!resumeFields ? (
          <Text style={styles.hint}>
            No resume parsed yet — redo onboarding to build your profile.
          </Text>
        ) : null}

        <View style={styles.cta}>
          <PrimaryButton label="Redo onboarding" onPress={() => router.push('/onboarding')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 110 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 22, fontFamily: font.bodyBold },
  name: { fontFamily: font.display, fontSize: 22, color: colors.slate900, marginTop: 6 },
  meta: { fontSize: 13, fontFamily: font.bodyMedium, color: colors.slate600, textAlign: 'center' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locText: { fontSize: 12, fontFamily: font.body, color: colors.slate500 },
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: 16,
    gap: 10,
  },
  sectionTitle: { fontFamily: font.bodyBold, fontSize: 14, color: colors.slate900 },
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skill: {
    backgroundColor: colors.brand50,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  skillText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.brand },
  readinessRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  readinessBadge: {
    backgroundColor: colors.brand,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  readinessText: { color: '#ffffff', fontFamily: font.bodyBold, fontSize: 14 },
  readinessHint: { flex: 1, fontSize: 12, fontFamily: font.body, color: colors.slate500, lineHeight: 17 },
  hint: { fontFamily: font.body, fontSize: 13, color: colors.slate500, textAlign: 'center' },
  cta: { borderRadius: radius.lg },
});
