import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Glyph } from '@/components/Glyph';
import { usePostAnswer, type SharedQuestionThread } from '@/api';
import { timeAgo } from '@/lib/time';
import { cardShadow, colors, font, radius } from '@/theme/tokens';

const AVATAR_PAIRS: [string, string][] = [
  ['#0f62fe', '#6366f1'],
  ['#f59e0b', '#fb7185'],
  ['#0d9488', '#0e7490'],
  ['#7c3aed', '#a855f7'],
];

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  );
}

function avatarColors(id: string): [string, string] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PAIRS[h % AVATAR_PAIRS.length];
}

function AnswerRow({ answer }: { answer: SharedQuestionThread['answers'][number] }) {
  return (
    <View style={styles.replyRow}>
      <View style={[styles.replyAvatar, { backgroundColor: colors.slate500 }]}>
        <Text style={styles.replyInitials}>{initialsOf(answer.author)}</Text>
      </View>
      <View style={styles.replyBody}>
        <View style={styles.replyMeta}>
          <Text style={styles.replyAuthor}>{answer.author}</Text>
          <Text style={styles.dotSep}>·</Text>
          <Text style={styles.replyHandle}>{timeAgo(answer.ago)}</Text>
        </View>
        <Text style={styles.replyText}>{answer.body}</Text>
      </View>
    </View>
  );
}

export function ThreadCard({
  thread,
  authorName,
}: {
  thread: SharedQuestionThread;
  authorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const postAnswer = usePostAnswer();

  const submit = () => {
    const body = draft.trim();
    if (body.length < 2 || postAnswer.isPending) return;
    postAnswer.mutate(
      { questionId: thread.id, author: authorName, body },
      { onSuccess: () => setDraft('') },
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.authorRow}>
        <View style={styles.authorLeft}>
          <LinearGradient
            colors={avatarColors(thread.id)}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={styles.avatar}
          >
            <Text style={styles.initials}>{initialsOf(thread.author)}</Text>
          </LinearGradient>
          <View style={styles.authorMeta}>
            <Text style={styles.author}>{thread.mine ? `${thread.author} (you)` : thread.author}</Text>
            <Text style={styles.dotSep}>·</Text>
            <Text style={styles.handle}>{timeAgo(thread.ago)}</Text>
          </View>
        </View>
        {thread.kind === 'unknown' ? (
          <View style={styles.kindBadge}>
            <Text style={styles.kindBadgeText}>Don't know</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title}>{thread.title}</Text>
      {thread.description ? (
        <Text style={styles.preview} numberOfLines={2}>
          {thread.description}
        </Text>
      ) : null}

      <View style={styles.tags}>
        {thread.tags.map((t) => (
          <View key={t} style={styles.tag}>
            <Text style={styles.tagText}>{t}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.footer, open && styles.footerWithReplies]}>
        <View style={styles.stat}>
          <Glyph name="chatbubble-outline" size={15} color={colors.slate500} />
          <Text style={styles.statText}>
            {thread.discussants > 1
              ? `${thread.discussants} people discussed this question`
              : 'Be the first to answer'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? 'Hide thread' : 'Answer'}
          onPress={() => setOpen((v) => !v)}
          style={[styles.answerBtn, open && styles.answerBtnOpen]}
        >
          <Text style={[styles.answerBtnText, open && styles.answerBtnTextOpen]}>
            {open ? 'Hide' : 'Answer'}
          </Text>
        </Pressable>
      </View>

      {open ? (
        <View style={styles.replies}>
          {thread.answers.map((a) => (
            <AnswerRow key={a.id} answer={a} />
          ))}
          {!thread.answers.length ? (
            <Text style={styles.noAnswers}>No answers yet — yours will be the first.</Text>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              placeholder="Write an answer…"
              placeholderTextColor={colors.slate400}
              value={draft}
              onChangeText={setDraft}
              multiline
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send answer"
              onPress={submit}
              disabled={draft.trim().length < 2 || postAnswer.isPending}
              style={[styles.sendBtn, draft.trim().length < 2 && styles.sendBtnOff]}
            >
              <Glyph name="send" size={14} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.slate200,
    padding: 16,
    ...cardShadow,
  },
  authorRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  authorLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#ffffff', fontSize: 12, fontFamily: font.bodySemi },
  authorMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  author: { fontSize: 12, fontFamily: font.bodyBold, color: colors.slate900 },
  handle: { fontSize: 11, fontFamily: font.body, color: colors.slate400 },
  dotSep: { color: colors.slate300 },
  kindBadge: {
    backgroundColor: '#fff1f1',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kindBadgeText: { fontSize: 10, fontFamily: font.bodySemi, color: colors.error },

  title: {
    fontFamily: font.bodyBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.slate900,
    marginBottom: 6,
  },
  preview: { fontSize: 12, lineHeight: 18, fontFamily: font.body, color: colors.slate600, marginBottom: 12 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  tag: { backgroundColor: colors.slate100, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.slate600 },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    gap: 10,
  },
  footerWithReplies: { marginBottom: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  statText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate600, flexShrink: 1 },
  answerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.slate900,
  },
  answerBtnOpen: { backgroundColor: colors.brand50, borderWidth: 1, borderColor: colors.brand200 },
  answerBtnText: { fontSize: 12, fontFamily: font.bodySemi, color: '#ffffff' },
  answerBtnTextOpen: { color: colors.brand },

  replies: {
    marginLeft: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.slate200,
    gap: 12,
    paddingTop: 4,
  },
  replyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  replyAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginRight: 8,
  },
  replyInitials: { color: '#ffffff', fontSize: 10, fontFamily: font.bodyBold },
  replyBody: { flex: 1 },
  replyMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  replyAuthor: { fontSize: 12, fontFamily: font.bodySemi, color: colors.slate800 },
  replyHandle: { fontSize: 10, fontFamily: font.body, color: colors.slate400 },
  replyText: { fontSize: 12, lineHeight: 17, fontFamily: font.body, color: colors.slate600, marginTop: 2 },
  noAnswers: { fontSize: 12, fontFamily: font.body, color: colors.slate500 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  composerInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: font.body,
    color: colors.slate800,
    maxHeight: 80,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.4 },
});
