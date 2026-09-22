import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BAND_LABELS } from '@/api';
import { Glyph } from '@/components/Glyph';
import type { Job } from '@/data/mock';
import { FEATURE_KEYS, FEATURE_LABELS, useFeatureNotes, type FeatureKey } from '@/llm/present';
import { cardShadow, colors, font, radius } from '@/theme/tokens';

const FEATURE_ICONS: Record<FeatureKey, string> = {
  skills: 'code-outline',
  experience: 'briefcase-outline',
  location: 'location-outline',
  salary: 'cash-outline',
  freshness: 'schedule',
};

function scoreColor(score: number): string {
  if (score >= 0.7) return colors.emerald700;
  if (score >= 0.45) return '#b45309';
  return '#b91c1c';
}

function FeatureRow({
  job,
  feature,
  note,
}: {
  job: Job;
  feature: FeatureKey;
  note: string;
}) {
  const score = job.matchData?.features[feature] ?? 0;
  const pct = Math.round(score * 100);
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureHead}>
        <View style={styles.featureLabelRow}>
          <Glyph name={FEATURE_ICONS[feature]} size={14} color={colors.slate500} />
          <Text style={styles.featureLabel}>{FEATURE_LABELS[feature]}</Text>
        </View>
        <Text style={[styles.featurePct, { color: scoreColor(score) }]}>{pct}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { flex: Math.max(0.02, score), backgroundColor: scoreColor(score) },
          ]}
        />
        <View style={{ flex: 1 - Math.max(0.02, score) }} />
      </View>
      <Text style={styles.featureNote}>{note}</Text>
    </View>
  );
}

export function JobDetailSheet({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const notes = useFeatureNotes(job);
  const apply = () => {
    if (job?.url) void Linking.openURL(job.url);
  };
  const m = job?.matchData;
  return (
    <Modal visible={!!job} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {job ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{job.title}</Text>
                <Text style={styles.companyLine}>
                  {job.company.name} · {job.source.name} · {job.ago}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close details"
                onPress={onClose}
                style={styles.closeBtn}
              >
                <Glyph name="close" size={18} color={colors.slate500} />
              </Pressable>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Glyph name="location-outline" size={13} color={colors.slate400} />
                <Text style={styles.metaText}>{job.location}</Text>
              </View>
              <Text style={styles.metaText}>{job.salary}</Text>
            </View>

            <View style={styles.scoreBanner}>
              <View>
                <Text style={styles.scorePct}>{job.match}%</Text>
                <Text style={styles.scoreCaption}>overall match</Text>
              </View>
              <View style={styles.bandPill}>
                <Glyph name="sparkle" size={12} color={colors.emerald800} />
                <Text style={styles.bandText}>
                  {m ? (BAND_LABELS[m.band] ?? 'Match') : job.analysisTag}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Score breakdown</Text>
            {FEATURE_KEYS.map((f) => (
              <FeatureRow key={f} job={job} feature={f} note={notes[f]} />
            ))}

            {m && (m.matchedSkills.length || m.missingSkills.length) ? (
              <>
                <Text style={styles.sectionTitle}>Skills</Text>
                <View style={styles.skillBlock}>
                  {m.matchedSkills.length ? (
                    <View style={styles.skillGroup}>
                      <Text style={styles.skillGroupLabel}>You have</Text>
                      <View style={styles.skillRow}>
                        {m.matchedSkills.slice(0, 8).map((s) => (
                          <View key={s} style={[styles.skillPill, styles.skillPillHave]}>
                            <Text style={styles.skillHaveText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                  {m.missingSkills.length ? (
                    <View style={styles.skillGroup}>
                      <Text style={styles.skillGroupLabel}>To strengthen</Text>
                      <View style={styles.skillRow}>
                        {m.missingSkills.slice(0, 8).map((s) => (
                          <View key={s} style={[styles.skillPill, styles.skillPillGap]}>
                            <Text style={styles.skillGapText}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apply for ${job.title}`}
              onPress={apply}
              style={({ pressed }) => [styles.applyBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.applyText}>Apply on {job.source.name}</Text>
              <Glyph name="open-outline" size={15} color="#ffffff" />
            </Pressable>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    ...cardShadow,
  },
  scroll: { padding: 20, paddingBottom: 32 },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate300,
    marginBottom: 14,
  },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1 },
  title: { fontFamily: font.display, fontSize: 20, letterSpacing: -0.4, color: colors.slate900 },
  companyLine: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate500, marginTop: 4 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontFamily: font.body, color: colors.slate600 },

  scoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.emerald50,
    borderWidth: 1,
    borderColor: colors.emerald100,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 14,
  },
  scorePct: { fontFamily: font.monoMedium, fontSize: 26, color: colors.emerald700 },
  scoreCaption: { fontSize: 10, fontFamily: font.bodyMedium, color: colors.emerald800, marginTop: 2 },
  bandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bandText: { fontSize: 12, fontFamily: font.bodySemi, color: colors.emerald800 },

  sectionTitle: {
    fontFamily: font.display,
    fontSize: 15,
    color: colors.slate900,
    marginTop: 18,
    marginBottom: 4,
  },

  featureRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.slate100 },
  featureHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featureLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureLabel: { fontSize: 13, fontFamily: font.bodySemi, color: colors.slate800 },
  featurePct: { fontFamily: font.monoMedium, fontSize: 13 },
  barTrack: {
    flexDirection: 'row',
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.slate100,
    overflow: 'hidden',
    marginTop: 6,
  },
  barFill: { borderRadius: 3 },
  featureNote: {
    fontSize: 12,
    fontFamily: font.body,
    color: colors.slate600,
    lineHeight: 17,
    marginTop: 6,
  },

  skillBlock: { gap: 10 },
  skillGroup: { gap: 6 },
  skillGroupLabel: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.slate500 },
  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  skillPill: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  skillPillHave: { backgroundColor: colors.emerald50, borderWidth: 1, borderColor: colors.emerald100 },
  skillHaveText: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.emerald800 },
  skillPillGap: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a' },
  skillGapText: { fontSize: 11, fontFamily: font.bodyMedium, color: '#92400e' },

  applyBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    paddingVertical: 14,
  },
  applyText: { color: '#ffffff', fontSize: 14, fontFamily: font.bodySemi },
});
