import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import { Glyph } from '@/components/Glyph';
import { ChatBubble, PrimaryButton, StageFooterContext, SweepIn, TorchAvatar } from '@/components/onboarding';
import {
  fallbackQuestions,
  fallbackTopics,
  generateQuestions,
  suggestTopics,
} from '@/llm/prep';
import { consentAndDownload, llmReady, useLlmState } from '@/llm/model';
import { shareUnknownQuestions } from '@/api';
import { useAuth } from '@/state/auth';
import { useQueryClient } from '@tanstack/react-query';
import type { ResumeFields } from '@/pdf/resume';
import { useOnboarding } from '@/state/onboarding';
import { colors, font, radius, spacing } from '@/theme/tokens';

type Answer = 'know' | 'dont';

function readiness(
  fields: ResumeFields | null,
  topics: string[],
  self?: { known: number; total: number },
): number {
  if (!fields) return 20;
  const skills = (Math.min(fields.skills.length, 10) / 10) * 35;
  const years = (Math.min(fields.yearsExperience ?? 0, 8) / 8) * 20;
  const completeness =
    (fields.email ? 4 : 0) +
    (fields.location ? 4 : 0) +
    (fields.education ? 4 : 0) +
    (fields.links.length ? 3 : 0);
  const engagement = (Math.min(topics.length, 3) / 3) * 10;

  const selfScore = self?.total ? (self.known / self.total) * 20 : 0;
  return Math.min(99, Math.round(skills + years + completeness + engagement + selfScore));
}

function readinessLabel(score: number): string {
  if (score >= 80) return 'Strong Baseline';
  if (score >= 60) return 'Good Base';
  if (score >= 40) return 'Getting There';
  return 'Early Stage';
}

function ModelGate({ onSkip }: { onSkip: () => void }) {
  const llm = useLlmState();
  if (llm.status === 'idle') {
    return (
      <ChatBubble title="Interview prep runs on your device">
        <Text style={styles.note}>
          I'll suggest interview topics and draft questions with Gemma-4 — the model lives on this
          phone (~3.4 GB, Wi-Fi recommended), so nothing leaves it.
        </Text>
        <View style={styles.rowBtns}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void consentAndDownload()}
            style={styles.smallBtn}
          >
            <Text style={styles.smallBtnText}>Download model</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onSkip}>
            <Text style={styles.skipLink}>Skip prep</Text>
          </Pressable>
        </View>
      </ChatBubble>
    );
  }
  if (llm.status === 'downloading' || llm.status === 'verifying') {
    return (
      <ChatBubble
        title={llm.status === 'verifying' ? 'Verifying model…' : 'Downloading Gemma-4…'}
      >
        {llm.status === 'downloading' ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { flex: Math.max(0.05, llm.progress) }]} />
            <View style={{ flex: 1 - Math.max(0.05, llm.progress) }} />
          </View>
        ) : null}
        <Text style={styles.note}>
          {llm.status === 'verifying'
            ? 'Checking the file checksum before installing.'
            : `${Math.round(llm.progress * 100)}% — then I'll draft your topics.`}
        </Text>
        <Pressable accessibilityRole="button" onPress={onSkip}>
          <Text style={styles.skipLink}>Skip prep for now</Text>
        </Pressable>
      </ChatBubble>
    );
  }
  if (llm.status === 'error') {
    return (
      <ChatBubble title="Model download failed">
        <Text style={styles.note}>{llm.error ?? 'Something went wrong'}</Text>
        <View style={styles.rowBtns}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void consentAndDownload()}
            style={styles.smallBtn}
          >
            <Text style={styles.smallBtnText}>Retry</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onSkip}>
            <Text style={styles.skipLink}>Skip prep</Text>
          </Pressable>
        </View>
      </ChatBubble>
    );
  }
  return null;
}

export function ProfileStage() {
  const router = useRouter();
  const setFooter = useContext(StageFooterContext);
  const { resumeFields, profileId, setDigitalProfile } = useOnboarding();
  const { completeOnboarding } = useAuth();
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const llm = useLlmState();

  const firstName = resumeFields?.name?.split(' ')[0] ?? 'there';
  const modelOn = llm.status === 'ready' && llmReady();

  const [skipped, setSkipped] = useState(false);
  const [topics, setTopics] = useState<string[] | null>(null);
  const [modelTopics, setModelTopics] = useState(false);
  const [topicsBusy, setTopicsBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [questionsBusy, setQuestionsBusy] = useState(false);
  const [questionsFromModel, setQuestionsFromModel] = useState(false);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});

  const knownCount = useMemo(
    () => Object.values(answers).filter((a) => a === 'know').length,
    [answers],
  );
  const score = useMemo(
    () =>
      readiness(resumeFields, [...picked], {
        known: knownCount,
        total: questions?.length ?? 0,
      }),
    [resumeFields, picked, knownCount, questions],
  );


  useEffect(() => {
    if (topics !== null || topicsBusy) return;
    if (modelOn) {
      setTopicsBusy(true);
      void suggestTopics(resumeFields).then((t) => {
        setTopics(t ?? fallbackTopics(resumeFields));
        setModelTopics(!!t);
        setTopicsBusy(false);
      });
    } else if (skipped || llm.status === 'error') {
      setTopics(fallbackTopics(resumeFields));
      setModelTopics(false);
    }
  }, [modelOn, skipped, llm.status, topics, topicsBusy, resumeFields]);

  const toggleTopic = (t: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const mark = (i: number, a: Answer) => setAnswers((prev) => ({ ...prev, [i]: a }));

  const makeQuestions = async () => {
    const chosen = [...picked];
    if (!chosen.length || questionsBusy) return;
    setQuestionsBusy(true);
    const qs = modelOn ? await generateQuestions(chosen, resumeFields) : null;
    setQuestions(qs ?? fallbackQuestions(chosen));
    setQuestionsFromModel(!!qs);
    setAnswers({});
    setQuestionsBusy(false);
  };

  const finish = async () => {
    if (saving || (questions && Object.keys(answers).length < questions.length)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const unknownIdx = Object.keys(answers)
        .map(Number)
        .filter((i) => answers[i] === 'dont');
      setDigitalProfile({
        topics: [...picked],
        questions: questions ?? [],
        known: Object.keys(answers)
          .map(Number)
          .filter((i) => answers[i] === 'know'),
        readiness: score,
      });

      if (questions && unknownIdx.length) {
        const skills = resumeFields?.skills ?? [];
        await shareUnknownQuestions({
          profileId,
          author: resumeFields?.name?.split(' ')[0] ?? 'You',
          questions: unknownIdx.map((i) => {
            const q = questions[i].toLowerCase();
            return {
              question: questions[i],
              topic: [...picked].find((t) => q.includes(t.toLowerCase())) ?? [...picked][0] ?? null,
              skills,
            };
          }),
        });
      }
      await client.invalidateQueries({ queryKey: ['myQuestions'] });
      await client.invalidateQueries({ queryKey: ['threads'] });
      await completeOnboarding();
      router.replace('/(tabs)');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save your questions. Please retry.');
    } finally {
      setSaving(false);
    }
  };

  const answeredCount = Object.keys(answers).length;
  const allAnswered = !questions || answeredCount >= questions.length;


  useEffect(() => {
    setFooter(
      <View style={styles.bottomBar}>
        <View style={styles.readinessRow}>
          <View style={styles.readinessPill}>
            <View style={styles.pillDot} />
            <Text style={styles.readinessPillText}>
              Estimated Match Readiness: {score}%
            </Text>
          </View>
          <View style={styles.trendRow}>
            <Glyph name="trending-up" size={14} color={colors.success} />
            <Text style={styles.trendText}>{readinessLabel(score)}</Text>
          </View>
        </View>
        <PrimaryButton label={saving ? 'Saving…' : 'View Scouted Roles'} onPress={() => void finish()} disabled={!allAnswered || saving} />
        {saveError ? <Text accessibilityRole="alert" style={styles.caption}>{saveError}</Text> : null}
        <Text style={styles.caption}>
          {allAnswered
            ? 'Your responses calibrate AI scout matching weights and interview prep prompts.'
            : `Answer all ${questions?.length} questions to continue — ${answeredCount}/${questions?.length} done.`}
        </Text>
      </View>,
    );
    return () => setFooter(null);

  }, [score, picked, questions, answers, knownCount, answeredCount, allAnswered, saving, saveError, profileId]);


  const firstUnanswered = questions
    ? questions.findIndex((_, i) => answers[i] === undefined)
    : -1;
  const visibleCount =
    !questions ? 0 : firstUnanswered === -1 ? questions.length : firstUnanswered + 1;

  return (
    <>
        <SweepIn delay={80}>
        <View style={styles.assessCard}>
          <View style={styles.assessHead}>
            <TorchAvatar />
            <Text style={styles.assessTitle}>
              4. Let's build your Digital Profile, {firstName}
            </Text>
          </View>
          <Text style={styles.assessBody}>
            Tell me what kind of interview questions you typically face or want to target. I'll
            evaluate your readiness.
          </Text>

          {topicsBusy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.busyText}>Gemma-4 is picking your interview topics…</Text>
            </View>
          ) : null}

          {topics ? (
            <View style={styles.topicWrap}>
              {topics.map((t) => {
                const on = picked.has(t);
                return (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    onPress={() => toggleTopic(t)}
                    style={[styles.topicChip, on && styles.topicChipOn]}
                  >
                    <Glyph
                      name={on ? 'check' : 'add'}
                      size={14}
                      color={on ? '#ffffff' : colors.slate500}
                    />
                    <Text style={[styles.topicChipText, on && styles.topicChipTextOn]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {topics && !questions ? (
            <Pressable
              accessibilityRole="button"
              disabled={!picked.size || questionsBusy}
              onPress={() => void makeQuestions()}
              style={[styles.genBtn, (!picked.size || questionsBusy) && { opacity: 0.5 }]}
            >
              {questionsBusy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Glyph name="sparkle" size={15} color="#ffffff" />
                  <Text style={styles.genBtnText}>Generate 10 interview questions</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
        </SweepIn>

        {!modelOn && topics === null ? (
          <SweepIn>
            <ModelGate onSkip={() => setSkipped(true)} />
          </SweepIn>
        ) : null}

        {questions ? (
          <SweepIn>
          <View style={styles.summaryCard}>
            <View style={styles.summaryHead}>
              <Text style={styles.summaryText}>
                Generated{' '}
                <Text style={styles.summaryAccent}>{questions.length} targeted questions</Text>{' '}
                based on selected tracks
                {questionsFromModel ? '' : ' (on-device model unavailable)'}:
              </Text>
              <Text style={styles.summaryBadge}>{score}% ready</Text>
            </View>
            <View style={styles.summaryTrack}>
              <View
                style={[styles.summaryFill, { flex: Math.max(0.02, score / 100) }]}
              />
              <View style={{ flex: 1 - Math.max(0.02, score / 100) }} />
            </View>
            <View style={styles.counters}>
              <View style={styles.counter}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <Text style={[styles.counterText, { color: colors.success }]}>
                  {knownCount} Know
                </Text>
              </View>
              <View style={styles.counter}>
                <View style={[styles.dot, { backgroundColor: colors.error }]} />
                <Text style={[styles.counterText, { color: colors.error }]}>
                  {Object.values(answers).filter((a) => a === 'dont').length} Don't know
                </Text>
              </View>
              <View style={styles.counter}>
                <View style={[styles.dot, { backgroundColor: colors.surfaceHighest }]} />
                <Text style={[styles.counterText, { color: colors.slate500 }]}>
                  {questions.length - Object.keys(answers).length} Remaining
                </Text>
              </View>
            </View>
          </View>
          </SweepIn>
        ) : null}

        {questions?.slice(0, visibleCount).map((q, i) => {
          const a = answers[i];
          return (
            <SweepIn key={i} delay={i === 0 ? 140 : 60}>
              <View style={styles.qCard}>
                <View style={styles.qRow}>
                  <Text style={styles.qNum}>Q{i + 1}</Text>
                  <Text style={styles.qText}>{q}</Text>
                </View>
                <View style={styles.qActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => mark(i, 'know')}
                    style={[styles.qBtn, a === 'know' && styles.qBtnKnow]}
                  >
                    {a === 'know' ? <Glyph name="check" size={14} color="#ffffff" /> : null}
                    <Text style={[styles.qBtnText, a === 'know' && styles.qBtnTextOn]}>Know</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => mark(i, 'dont')}
                    style={[styles.qBtn, a === 'dont' && styles.qBtnDont]}
                  >
                    {a === 'dont' ? <Glyph name="close" size={14} color={colors.error} /> : null}
                    <Text style={[styles.qBtnText, a === 'dont' && styles.qBtnTextDont]}>
                      Don't know
                    </Text>
                  </Pressable>
                </View>
              </View>
            </SweepIn>
          );
        })}
    </>
  );
}

export default function ProfileRoute() {
  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 24 },

  note: { fontSize: 12, fontFamily: font.body, color: colors.slate600, marginTop: 6, lineHeight: 17 },
  rowBtns: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  smallBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallBtnText: { fontSize: 12, fontFamily: font.bodySemi, color: '#ffffff' },
  skipLink: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate500 },
  progressTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: { backgroundColor: colors.brand, borderRadius: 3 },

  assessCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: 16,
    gap: 12,
  },
  assessHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  assessTitle: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, color: colors.ink },
  assessBody: { fontSize: 13, fontFamily: font.body, color: colors.slate600, lineHeight: 19 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  busyText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate500 },

  topicWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  topicChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  topicChipText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate700 },
  topicChipTextOn: { color: '#ffffff', fontFamily: font.bodySemi },

  genBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  genBtnText: { fontSize: 13, fontFamily: font.bodySemi, color: '#ffffff' },

  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand200,
    padding: 12,
    gap: 8,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  summaryText: { flex: 1, fontSize: 12, fontFamily: font.body, color: colors.ink, lineHeight: 17 },
  summaryAccent: { fontFamily: font.bodySemi, color: colors.brand },
  summaryBadge: {
    fontFamily: font.bodySemi,
    fontSize: 11,
    color: colors.brand,
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  summaryTrack: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  summaryFill: { backgroundColor: colors.brand, borderRadius: 3 },
  counters: { flexDirection: 'row', justifyContent: 'space-between' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  counterText: { fontFamily: font.bodyMedium, fontSize: 11 },

  qCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: 12,
    gap: 10,
  },
  qRow: { flexDirection: 'row', gap: 8 },
  qNum: { fontFamily: font.bodySemi, fontSize: 11, color: colors.brand, marginTop: 2 },
  qText: { flex: 1, fontSize: 12.5, fontFamily: font.bodyMedium, color: colors.ink, lineHeight: 18 },
  qActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  qBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  qBtnKnow: { backgroundColor: colors.brand },
  qBtnDont: { backgroundColor: '#fff1f1' },
  qBtnText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate600 },
  qBtnTextOn: { color: '#ffffff', fontFamily: font.bodySemi },
  qBtnTextDont: { color: colors.error, fontFamily: font.bodySemi },

  bottomBar: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceHigh,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: 8,
  },
  readinessRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readinessPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  readinessPillText: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.onPrimaryFixed },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trendText: { fontSize: 11, fontFamily: font.bodySemi, color: colors.success },
  caption: {
    fontSize: 10,
    fontFamily: font.body,
    color: colors.slate500,
    textAlign: 'center',
  },
});
