import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph } from '@/components/Glyph';
import type { Job } from '@/data/mock';
import { useRationale } from '@/llm/present';
import { cardShadow, colors, font, radius } from '@/theme/tokens';

function SourceBadge({ source }: { source: Job['source'] }) {
  return (
    <View style={[styles.sourceBadge, { backgroundColor: source.color }, source.round && { borderRadius: 8 }]}>
      {source.icon ? (
        <Glyph name={source.icon} size={10} color="#ffffff" />
      ) : (
        <Text style={styles.sourceBadgeText}>{source.badge}</Text>
      )}
    </View>
  );
}

export function JobCard({ job, onPress }: { job: Job; onPress?: () => void }) {
  const rationale = useRationale(job);
  const apply = () => {
    if (job.url) void Linking.openURL(job.url);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${job.title}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.sourceRow}>
          <SourceBadge source={job.source} />
          <Text style={styles.sourceName}>{job.source.name}</Text>
          <Text style={styles.dotSep}>•</Text>
          <Text style={styles.ago}>{job.ago}</Text>
        </View>
        <Glyph name="bookmark" size={18} color={colors.slate400} />
      </View>

      <View style={styles.titleRow}>
        <View style={styles.titleSide}>
          <Text style={styles.title} numberOfLines={2}>
            {job.title}
          </Text>
          <View style={styles.companyRow}>
            <View
              style={[
                styles.companyBadge,
                { backgroundColor: job.company.color },
                job.company.round && { borderRadius: 8 },
              ]}
            >
              <Text
                style={[
                  styles.companyLetter,
                  { color: job.company.textColor ?? '#ffffff' },
                  job.company.italic && { fontStyle: 'italic' },
                ]}
              >
                {job.company.letter}
              </Text>
            </View>
            <Text style={styles.companyName}>{job.company.name}</Text>
            <Glyph name="check-circle" size={13} color={colors.brand} />
          </View>
        </View>
        <View style={styles.matchBadge}>
          <Text style={styles.matchPct}>{job.match}%</Text>
          <View style={styles.matchLabelRow}>
            <Text style={styles.matchLabel}>Match</Text>
            <Glyph name="info" size={9} color={colors.emerald800} />
          </View>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.metaItem, styles.metaItemFlex]}>
          <Glyph name="location-outline" size={13} color={colors.slate400} />
          <Text style={styles.metaText} numberOfLines={1}>
            {job.location}
          </Text>
        </View>
        <Text style={styles.salary} numberOfLines={1}>
          {job.salary}
        </Text>
        <View style={styles.metaItem}>
          <Glyph name="briefcase-outline" size={13} color={colors.slate400} />
          <Text style={styles.metaText} numberOfLines={1}>
            {job.type}
          </Text>
        </View>
      </View>

      <View style={styles.analysis}>
        <Text style={styles.sparkle}>✨</Text>
        <Text style={styles.analysisText} numberOfLines={2}>
          <Text style={styles.analysisTag}>{job.analysisTag}</Text>
          {' — '}
          {rationale}
          {job.skillGap ? <Text style={styles.skillGap}>  {job.skillGap} ›</Text> : null}
        </Text>
        <Glyph name="chevron-right" size={14} color={colors.emerald700} />
      </View>

      <View style={styles.footer}>
        <View style={styles.skills}>
          {job.skills.slice(0, 3).map((s) => (
            <View key={s} style={styles.skillPill}>
              <Text style={styles.skillText}>{s}</Text>
            </View>
          ))}
          {job.skills.length - 3 + (job.extraSkills ?? 0) > 0 ? (
            <View style={styles.skillPill}>
              <Text style={styles.skillExtra}>
                +{job.skills.length - 3 + (job.extraSkills ?? 0)}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apply for ${job.title}`}
          onPress={apply}
          style={({ pressed }) => [
            styles.apply,
            job.applyStyle === 'brand' ? styles.applyBrand : styles.applyDark,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.applyText}>APPLY</Text>
          <Text style={styles.applyArrow}>→</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.slate200,
    ...cardShadow,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceBadge: {
    width: 16,
    height: 16,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBadgeText: { color: '#ffffff', fontSize: 10, fontFamily: font.bodyBold },
  sourceName: { fontSize: 12, fontFamily: font.bodySemi, color: colors.slate700 },
  dotSep: { color: colors.slate300 },
  ago: { fontSize: 12, fontFamily: font.body, color: colors.slate500 },

  titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  titleSide: { flex: 1 },
  title: {
    fontFamily: font.display,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.slate900,
    lineHeight: 21,
  },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  companyBadge: { width: 16, height: 16, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  companyLetter: { fontSize: 9, fontFamily: font.bodyBold },
  companyName: { fontSize: 12, fontFamily: font.bodySemi, color: colors.slate800 },
  matchBadge: {
    backgroundColor: colors.emerald50,
    borderWidth: 1,
    borderColor: colors.emerald200,
    borderRadius: radius.lg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  matchPct: { fontFamily: font.monoMedium, fontSize: 18, color: colors.emerald700, letterSpacing: -0.5 },
  matchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  matchLabel: { fontSize: 9, fontFamily: font.bodySemi, color: colors.emerald800 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaItemFlex: { flex: 1, minWidth: 0 },
  metaText: { fontSize: 12, fontFamily: font.body, color: colors.slate600 },
  salary: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate700 },

  analysis: {
    marginTop: 12,
    backgroundColor: colors.emerald50,
    borderWidth: 1,
    borderColor: colors.emerald100,
    borderRadius: radius.lg,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sparkle: { fontSize: 12, marginTop: -1 },
  analysisText: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: font.body, color: colors.slate700 },
  analysisTag: { fontFamily: font.bodySemi, color: colors.emerald900 },
  skillGap: { fontFamily: font.bodySemi, color: colors.emerald800 },

  footer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  skills: { flexDirection: 'row', flexWrap: 'nowrap', overflow: 'hidden', gap: 6, flex: 1 },
  skillPill: {
    backgroundColor: colors.slate100,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  skillText: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.slate700 },
  skillExtra: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.slate500 },
  apply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.lg,
  },
  applyDark: { backgroundColor: colors.apply },
  applyBrand: { backgroundColor: colors.brand, paddingHorizontal: 16 },
  applyText: { color: '#ffffff', fontSize: 12, fontFamily: font.bodySemi },
  applyArrow: { color: '#ffffff', fontSize: 14 },
});
