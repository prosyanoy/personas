import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { Glyph } from '@/components/Glyph';
import { ChatBubble, PrimaryButton, SweepIn, TorchAvatar } from '@/components/onboarding';
import { TIMELINE_OPTIONS } from '@/data/mock';
import { formatTime } from '@/lib/time';
import { useOnboarding } from '@/state/onboarding';
import { colors, font, radius, spacing } from '@/theme/tokens';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ResumeRecap() {
  const { resumeFile, resumeAt, resumeFields } = useOnboarding();
  if (!resumeFile) {
    return (
      <View style={[styles.recapRow, { opacity: 0.85 }]}>
        <TorchAvatar />
        <View style={styles.recapSide}>
          <View style={styles.recapBubble}>
            <Text style={styles.recapLabel}>Step 2 • Resume</Text>
            <Text style={styles.recapBody}>Skipped — match on connectors only</Text>
          </View>
          <Text style={styles.timestamp}>{resumeAt ? formatTime(resumeAt) : ''}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.recapRow, { opacity: 0.85 }]}>
      <TorchAvatar />
      <View style={styles.recapSide}>
        <View style={styles.recapBubble}>
          <Text style={styles.recapLabel}>Step 2 • Resume Analyzed</Text>
          <View style={styles.fileCard}>
            <View style={styles.fileLeft}>
              <View style={styles.fileIcon}>
                <Glyph name="description" size={14} color={colors.brand} />
              </View>
              <View style={styles.fileText}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {resumeFile.name}
                </Text>
                <View style={styles.fileOkRow}>
                  <Glyph name="check-circle" size={11} color={colors.brand} />
                  <Text style={styles.fileOk}>
                    Parsed & indexed
                    {resumeFields?.skills.length ? ` · ${resumeFields.skills.length} skills` : ''}
                  </Text>
                </View>
              </View>
            </View>
            <Text style={styles.fileSize}>{formatSize(resumeFile.size)}</Text>
          </View>
        </View>
        <Text style={styles.timestamp}>{resumeAt ? formatTime(resumeAt) : ''}</Text>
      </View>
    </View>
  );
}

export function CredentialsPill() {
  const { resumeFile, resumeAt } = useOnboarding();
  if (!resumeFile) return null;
  return (
    <View style={styles.credWrap}>
      <View style={styles.credPill}>
        <Glyph name="task-alt" size={14} color={colors.brand} />
        <Text style={styles.credText}>Credentials confirmed</Text>
        <Text style={styles.credTime}>{resumeAt ? formatTime(resumeAt) : ''}</Text>
      </View>
    </View>
  );
}

export function TimelineStage({ onDone }: { onDone: () => void }) {
  const { timeline, setTimeline } = useOnboarding();

  return (
    <>
        <SweepIn delay={80}>
        <ChatBubble>
          <View style={styles.qTitleRow}>
            <Text style={styles.qTitle}>3. How soon do you want to be hired?</Text>
          </View>
          <Text style={styles.qBody}>
            This helps my recommendation algorithms prioritize instant interview slots versus ongoing
            pipeline matches.
          </Text>
          <Text style={styles.aiActive}>•  AI Active</Text>
        </ChatBubble>
        </SweepIn>

        <View style={styles.options}>
          {TIMELINE_OPTIONS.map((opt, i) => {
            const selected = timeline === opt.id;
            return (
              <SweepIn key={opt.id} delay={480 + i * 70}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setTimeline(opt.id)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <View style={styles.optionLeft}>
                    <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                      <Glyph name={opt.icon} size={15} color={selected ? '#ffffff' : colors.slate500} />
                    </View>
                    <View style={styles.optionText}>
                      <Text style={styles.optionLabel}>{opt.label}</Text>
                      <Text style={styles.optionDetail} numberOfLines={1}>
                        {opt.detail}
                      </Text>
                    </View>
                  </View>
                  {selected ? (
                    <View style={styles.optionCheck}>
                      <Glyph name="check" size={11} color="#ffffff" />
                    </View>
                  ) : null}
                </Pressable>
              </SweepIn>
            );
          })}
        </View>

        <SweepIn delay={800} style={styles.scoutCardWrap}>
          <View style={styles.scoutCard}>
            <View style={styles.scoutBadge}>
              <Text style={styles.scoutBolt}>⚡</Text>
            </View>
            <View style={styles.scoutText}>
              <Text style={styles.scoutTitle}>
                Scouting <Text style={styles.scoutCount}>42 active roles</Text> matching your criteria
              </Text>
              <Text style={styles.scoutSub}>
                High relevance detected in Frontend, Full-stack & Design Systems
              </Text>
            </View>
          </View>
        </SweepIn>

        <SweepIn delay={900} style={styles.ctaArea}>
          <PrimaryButton label="Continue" onPress={onDone} />
          <Text style={styles.caption}>
            You can always change your timeline and scouting rules later in profile settings.
          </Text>
        </SweepIn>
    </>
  );
}

export default function TimelineRoute() {
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { padding: spacing.lg, gap: spacing.xl },

  headerWrap: { gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  headerTitle: { fontFamily: font.displaySemi, fontSize: 13, letterSpacing: -0.2, color: colors.ink },
  headerStep: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate500 },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressDone: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: colors.brand },
  progressPending: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceHigh },

  recapRow: { flexDirection: 'row', gap: 12 },
  recapSide: { flex: 1, alignItems: 'flex-start' },
  recapBubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderTopLeftRadius: 0,
    padding: 14,
    alignSelf: 'stretch',
  },
  recapLabel: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate500, marginBottom: 2 },
  recapBody: { fontSize: 14, fontFamily: font.body, color: colors.ink },
  recapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  recapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recapChipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  recapChipText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.ink },
  timestamp: { fontFamily: font.body, fontSize: 10, color: colors.slate500, marginTop: 4, marginLeft: 4 },

  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    padding: 10,
    marginTop: 4,
  },
  fileLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  fileIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: { flex: 1 },
  fileName: { fontSize: 12, fontFamily: font.bodySemi, color: colors.ink },
  fileOkRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  fileOk: { fontSize: 10, fontFamily: font.bodyMedium, color: colors.brand },
  fileSize: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.slate500 },

  credWrap: { alignItems: 'flex-end' },
  credPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.xl,
    borderBottomRightRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  credText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.ink },
  credTime: { fontSize: 10, fontFamily: font.body, color: colors.ink, opacity: 0.7, marginLeft: 4 },

  qTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 },
  qTitle: { fontFamily: font.bodySemi, fontSize: 14, letterSpacing: -0.2, color: colors.ink, flex: 1 },
  finalTag: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  finalTagText: {
    fontFamily: font.display,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.onPrimaryFixed,
  },
  qBody: { fontSize: 12, lineHeight: 18, fontFamily: font.body, color: colors.slate600 },
  aiActive: { fontSize: 10, fontFamily: font.bodyMedium, color: colors.brand, marginTop: 4 },

  options: { marginLeft: 44, gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 12,
  },
  optionSelected: { borderColor: colors.brand, backgroundColor: 'rgba(208,226,255,0.3)' },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconSelected: { backgroundColor: colors.brand },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 12, fontFamily: font.bodySemi, color: colors.ink },
  optionDetail: { fontSize: 10, fontFamily: font.body, color: colors.slate500, marginTop: 1 },
  optionCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scoutCardWrap: { marginLeft: 44 },
  scoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.page,
    borderRadius: radius.lg,
    padding: 12,
  },
  scoutBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoutBolt: { fontSize: 11, color: '#ffffff' },
  scoutText: { flex: 1 },
  scoutTitle: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.ink },
  scoutCount: { fontFamily: font.bodySemi },
  scoutSub: { fontSize: 10, fontFamily: font.body, color: colors.slate500, marginTop: 1 },

  ctaArea: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  caption: { fontSize: 11, fontFamily: font.body, color: colors.slate500, textAlign: 'center' },
});
