import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { Glyph } from '@/components/Glyph';
import { JobCard } from '@/components/JobCard';
import { JobDetailSheet } from '@/components/JobDetailSheet';
import { patchLatestProfile, useJobs, useScoutRefresh } from '@/api';
import type { Job } from '@/data/mock';
import { useOnboarding } from '@/state/onboarding';
import { colors, font, radius, spacing } from '@/theme/tokens';

const SOURCES = [
  { id: 'linkedin', name: 'LinkedIn' },
  { id: 'naukri', name: 'Naukri' },
  { id: 'instahyre', name: 'Instahyre' },
  { id: 'cutshort', name: 'Cutshort' },
  { id: 'wellfound', name: 'Wellfound' },
  { id: 'telegram', name: 'Telegram' },
];

const LOCATION_OPTIONS = [
  'Bengaluru',
  'Mumbai',
  'Delhi NCR',
  'Hyderabad',
  'Pune',
  'Chennai',
  'Kolkata',
  'Remote',
  'London',
  'Berlin',
  'Singapore',
  'Dubai',
];

const SALARY_OPTIONS = [
  { label: 'Any salary', min: null },
  { label: '₹ 12L+', min: 1_200_000 },
  { label: '₹ 18L+', min: 1_800_000 },
  { label: '₹ 24L+', min: 2_400_000 },
  { label: '₹ 30L+', min: 3_000_000 },
  { label: '₹ 40L+', min: 4_000_000 },
];

type SheetKind = 'sources' | 'location' | 'salary' | null;

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{title}</Text>
        {children}
      </View>
    </Modal>
  );
}

function FilterRow({
  count,
  location,
  salaryMin,
  enabledCount,
  onOpen,
}: {
  count: number;
  location: string | null | undefined;
  salaryMin: number | null;
  enabledCount: number;
  onOpen: (kind: Exclude<SheetKind, null>) => void;
}) {
  const router = useRouter();
  const { resumeFields } = useOnboarding();
  const firstName = resumeFields?.name?.split(' ')[0] ?? 'there';
  return (
    <View style={styles.headerBlock}>
      <View style={styles.greetingRow}>
        <View>
          <Text style={styles.greeting}>Hi {firstName} 👋</Text>
          <Text style={styles.greetingSub}>
            {count ? `${count} fresh roles matched` : 'Your scout is on it'}
          </Text>
        </View>
        <Pressable style={styles.supportPill} onPress={() => router.push('/support')}>
          <Glyph name="chatbubble-outline" size={15} color={colors.brand} />
          <Text style={styles.supportText}>Ask Support Agent</Text>
        </Pressable>
      </View>

      <View style={styles.filters}>
        <Pressable style={styles.filterChip} onPress={() => onOpen('sources')}>
          <Glyph name="options-outline" size={13} color={colors.slate400} />
          {enabledCount < SOURCES.length ? (
            <Text style={styles.filterText}>{enabledCount}</Text>
          ) : null}
        </Pressable>
        <Pressable style={styles.filterChip} onPress={() => onOpen('location')}>
          <Glyph name="location-outline" size={13} color={colors.slate400} />
          <Text style={styles.filterText}>{location ?? 'Location'}</Text>
          <Glyph name="chevron-down" size={13} color={colors.slate400} />
        </Pressable>
        <Pressable style={styles.filterChip} onPress={() => onOpen('salary')}>
          <Text style={styles.filterText}>
            {salaryMin ? `₹ ${Math.round(salaryMin / 100_000)}L+` : 'Salary'}
          </Text>
          <Glyph name="chevron-down" size={13} color={colors.slate400} />
        </Pressable>
      </View>
    </View>
  );
}

export default function MatchesFeed() {
  const { resumeFields, updateResumeFields, connectors } = useOnboarding();
  const { data: jobs, isLoading, isError } = useJobs(resumeFields);
  const refresh = useScoutRefresh(resumeFields);
  const [selected, setSelected] = useState<Job | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const [enabledSources, setEnabledSources] = useState<Set<string>>(() => {
    const picked = connectors.filter((id) => SOURCES.some((s) => s.id === id));
    return new Set(picked.length ? picked : SOURCES.map((s) => s.id));
  });
  const [salaryMin, setSalaryMin] = useState<number | null>(null);
  const [locInput, setLocInput] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const visibleJobs = useMemo(
    () =>
      (jobs ?? []).filter((j) => {
        const src = j.matchData?.sourceId;
        if (src && !enabledSources.has(src)) return false;
        if (salaryMin) {
          const min = j.matchData?.salaryMin;
          const max = j.matchData?.salaryMax;

          if (min != null || max != null) return (max ?? min ?? 0) >= salaryMin;
        }
        const q = query.trim().toLowerCase();
        if (q) {
          const haystack = [
            j.title,
            j.company?.name,
            j.location,
            j.salary,
            j.type,
            j.source?.name,
            j.analysisTag,
            j.analysis,
            ...(j.skills ?? []),
            ...(j.matchData?.matchedSkills ?? []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!q.split(/\s+/).every((w) => haystack.includes(w))) return false;
        }
        return true;
      }),
    [jobs, enabledSources, salaryMin, query],
  );

  const toggleSource = (id: string) => {
    setEnabledSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {

        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const chooseLocation = (loc: string) => {
    const v = loc.trim();
    if (v.length < 2) return;
    updateResumeFields({ location: v });
    void patchLatestProfile({ location: v });
    setSheet(null);
    setLocInput('');

    refresh.mutate(v);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader onSearch={() => setSearchOpen((v) => !v)} />
      {searchOpen ? (
        <View style={styles.searchRow}>
          <Glyph name="search" size={16} color={colors.slate400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search title, company, skill…"
            placeholderTextColor={colors.slate400}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              hitSlop={8}
            >
              <Glyph name="close" size={16} color={colors.slate400} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingText}>Scoring roles against your profile…</Text>
        </View>
      ) : (
        <FlatList
          data={visibleJobs}
          keyExtractor={(j) => j.id}
          renderItem={({ item }) => <JobCard job={item} onPress={() => setSelected(item)} />}
          ListHeaderComponent={
            <FilterRow
              count={visibleJobs.length}
              location={resumeFields?.location}
              salaryMin={salaryMin}
              enabledCount={enabledSources.size}
              onOpen={setSheet}
            />
          }
          ListEmptyComponent={
            <View style={styles.loading}>
              <Glyph name="person-search" size={28} color={colors.slate400} />
              <Text style={styles.emptyTitle}>
                {isError
                  ? "Can't reach the scout backend"
                  : query
                    ? `No roles match “${query}”`
                    : 'No matches yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {isError
                  ? 'Start the backend, then pull down to rescan.'
                  : query
                    ? 'Try a different title, company, or skill.'
                    : enabledSources.size < SOURCES.length || salaryMin
                    ? 'Filters are hiding some results — loosen them or pull down to rescan.'
                    : 'Pull down to run the scouts and score fresh postings.'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refresh.isPending}
              onRefresh={() => refresh.mutate()}
              tintColor={colors.brand}
            />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <JobDetailSheet job={selected} onClose={() => setSelected(null)} />

      {sheet === 'sources' ? (
        <Sheet title="Job sources" onClose={() => setSheet(null)}>
          {SOURCES.map((s) => {
            const on = enabledSources.has(s.id);
            return (
              <Pressable key={s.id} style={styles.optionRow} onPress={() => toggleSource(s.id)}>
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on ? <Glyph name="check" size={12} color="#ffffff" /> : null}
                </View>
                <Text style={styles.optionText}>{s.name}</Text>
              </Pressable>
            );
          })}
        </Sheet>
      ) : null}

      {sheet === 'location' ? (
        <Sheet title="Preferred location" onClose={() => setSheet(null)}>
          <View style={styles.chipWrap}>
            {LOCATION_OPTIONS.map((loc) => {
              const active = resumeFields?.location === loc;
              return (
                <Pressable
                  key={loc}
                  style={[styles.locChip, active && styles.locChipActive]}
                  onPress={() => chooseLocation(loc)}
                >
                  <Text style={[styles.locChipText, active && styles.locChipTextActive]}>
                    {loc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.locInputRow}>
            <TextInput
              style={styles.locInput}
              placeholder="Other city or country…"
              placeholderTextColor={colors.slate400}
              value={locInput}
              onChangeText={setLocInput}
              autoCapitalize="words"
              onSubmitEditing={() => chooseLocation(locInput)}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => chooseLocation(locInput)}
              disabled={locInput.trim().length < 2}
              style={[styles.locGo, locInput.trim().length < 2 && { opacity: 0.5 }]}
            >
              <Glyph name="arrow-forward" size={16} color="#ffffff" />
            </Pressable>
          </View>
          <Text style={styles.sheetNote}>Changing location re-scouts postings for that area.</Text>
        </Sheet>
      ) : null}

      {sheet === 'salary' ? (
        <Sheet title="Minimum salary" onClose={() => setSheet(null)}>
          {SALARY_OPTIONS.map((o) => {
            const active = salaryMin === o.min;
            return (
              <Pressable
                key={o.label}
                style={styles.optionRow}
                onPress={() => {
                  setSalaryMin(o.min);
                  setSheet(null);
                }}
              >
                <View style={[styles.radio, active && styles.radioOn]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={styles.optionText}>{o.label}</Text>
              </Pressable>
            );
          })}
          <Text style={styles.sheetNote}>
            Filters this list only — your match scores are unchanged.
          </Text>
        </Sheet>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 32 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  loadingText: { fontSize: 13, fontFamily: font.body, color: colors.slate500 },
  emptyTitle: { fontSize: 15, fontFamily: font.bodySemi, color: colors.slate800 },
  emptyBody: { fontSize: 13, fontFamily: font.body, color: colors.slate500, textAlign: 'center' },

  headerBlock: { gap: spacing.md, marginBottom: spacing.lg },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: {
    fontFamily: font.display,
    fontSize: 24,
    letterSpacing: -0.5,
    color: colors.slate900,
  },
  greetingSub: { fontFamily: font.bodyMedium, fontSize: 14, color: colors.slate500, marginTop: 2 },
  supportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  supportText: { fontSize: 12, fontFamily: font.bodySemi, color: colors.slate800 },

  filters: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate800 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: font.body,
    color: colors.slate800,
    paddingVertical: 0,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.3)' },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 34,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate300,
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: font.display,
    fontSize: 16,
    color: colors.slate900,
    marginBottom: 10,
  },
  sheetNote: {
    fontSize: 11,
    fontFamily: font.body,
    color: colors.slate500,
    marginTop: 12,
  },

  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  optionText: { fontSize: 14, fontFamily: font.bodyMedium, color: colors.slate800 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.slate300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: '#ffffff',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  locChipActive: { backgroundColor: colors.primaryContainer, borderColor: colors.brand },
  locChipText: { fontSize: 13, fontFamily: font.bodyMedium, color: colors.slate700 },
  locChipTextActive: { color: colors.brand, fontFamily: font.bodySemi },
  locInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 14 },
  locInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    paddingHorizontal: 14,
    fontSize: 13,
    fontFamily: font.body,
    color: colors.ink,
  },
  locGo: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
