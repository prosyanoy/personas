import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Glyph } from '@/components/Glyph';
import { useMyQuestions, type SharedQuestionThread } from '@/api';
import { timeAgo } from '@/lib/time';
import { useOnboarding } from '@/state/onboarding';
import { colors, font, radius, spacing } from '@/theme/tokens';

function QuestionCard({ q }: { q: SharedQuestionThread }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.kindBadge, q.kind === 'post' ? styles.kindPost : styles.kindUnknown]}>
          <Text style={[styles.kindText, q.kind === 'post' ? styles.kindTextPost : styles.kindTextUnknown]}>
            {q.kind === 'post' ? 'Posted' : "Don't know"}
          </Text>
        </View>
        <View style={styles.replyBadge}>
          <Glyph name="chatbubble-outline" size={11} color={colors.brand} />
          <Text style={styles.replyCount}>{q.replies}</Text>
        </View>
      </View>
      <Text style={styles.question}>{q.title}</Text>
      {q.description ? <Text style={styles.desc}>{q.description}</Text> : null}
      {q.tags.length ? (
        <View style={styles.tagRow}>
          {q.tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {q.answers.length ? (
        <View style={styles.answers}>
          {q.answers.map((a) => (
            <View key={a.id} style={styles.answer}>
              <View style={styles.answerHead}>
                <Text style={styles.answerAuthor}>{a.author}</Text>
                <Text style={styles.answerAgo}>{timeAgo(a.ago)}</Text>
              </View>
              <Text style={styles.answerBody}>{a.body}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.waiting}>No answers yet — shared with peers with similar skills.</Text>
      )}
    </View>
  );
}

export default function Activity() {
  const { profileId, resumeFields } = useOnboarding();
  const { data: questions, isLoading, isError, refetch, isRefetching } =
    useMyQuestions(profileId, resumeFields?.name);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader />
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingText}>Loading your questions…</Text>
        </View>
      ) : (
      <FlatList
        data={questions ?? []}
        keyExtractor={(q) => q.id}
        renderItem={({ item }) => <QuestionCard q={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.head}>
            <Text style={styles.title}>Activity</Text>
            <Text style={styles.subtitle}>
              Every question you've raised — "Don't know" shares and community posts — with live answers.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.iconWrap}>
              <Glyph name="activity-outline" size={28} color={colors.brand} />
            </View>
            <Text style={styles.emptyTitle}>
              {isError ? "Can't reach the backend" : 'Nothing yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {isError
                ? 'Start the backend, then pull down to retry.'
                : 'Questions you mark "Don\'t know" during onboarding — or post in Discussions — appear here with community answers.'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.brand}
          />
        }
      />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontFamily: font.body, color: colors.slate500 },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 110 },
  head: { marginBottom: 4 },
  title: { fontFamily: font.display, fontSize: 24, letterSpacing: -0.5, color: colors.slate900 },
  subtitle: { fontSize: 12, fontFamily: font.body, color: colors.slate500, marginTop: 4 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.surfaceHigh,
    padding: 14,
    gap: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kindBadge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  kindPost: { backgroundColor: colors.brand50 },
  kindUnknown: { backgroundColor: '#fff1f1' },
  kindText: { fontSize: 10, fontFamily: font.bodySemi },
  kindTextPost: { color: colors.brand },
  kindTextUnknown: { color: colors.error },
  question: { flex: 1, fontSize: 13, fontFamily: font.bodySemi, color: colors.ink, lineHeight: 19 },
  desc: { fontSize: 12, fontFamily: font.body, color: colors.slate600, lineHeight: 17 },
  replyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand50,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  replyCount: { fontSize: 11, fontFamily: font.bodySemi, color: colors.brand },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: { fontSize: 10, fontFamily: font.bodyMedium, color: colors.slate600 },
  answers: { gap: 8, borderTopWidth: 1, borderTopColor: colors.surface, paddingTop: 10 },
  answer: { gap: 2 },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  answerAuthor: { fontSize: 11, fontFamily: font.bodySemi, color: colors.ink },
  answerAgo: { fontSize: 10, fontFamily: font.body, color: colors.slate500 },
  answerBody: { fontSize: 12, fontFamily: font.body, color: colors.slate600, lineHeight: 17 },
  waiting: { fontSize: 11, fontFamily: font.body, color: colors.slate500 },

  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8, marginTop: 80 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontFamily: font.display, fontSize: 20, color: colors.slate900 },
  emptyBody: { fontFamily: font.body, fontSize: 14, color: colors.slate500, textAlign: 'center' },
});
