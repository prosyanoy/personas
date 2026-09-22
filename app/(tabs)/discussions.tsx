import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { AppHeader } from '@/components/AppHeader';
import { Glyph } from '@/components/Glyph';
import { ThreadCard } from '@/components/ThreadCard';
import { PrimaryButton } from '@/components/onboarding';
import { usePostDiscussion, useThreads } from '@/api';
import { DISCUSSION_CATEGORIES } from '@/data/mock';
import { useOnboarding } from '@/state/onboarding';
import { colors, floatShadow, font, radius, spacing } from '@/theme/tokens';

const POST_TOPICS = DISCUSSION_CATEGORIES.filter((c) => c !== 'For you');

function TitleBlock({
  category,
  onCategory,
}: {
  category: string;
  onCategory: (c: string) => void;
}) {
  return (
    <View style={styles.titleBlock}>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>Discussions</Text>
          <Text style={styles.subtitle}>Interview questions from the community</Text>
        </View>
        <LinearGradient
          colors={[colors.emerald50, colors.teal50, colors.cyan100]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <Glyph name="sparkle" size={13} color={colors.teal600} />
          <View>
            <Text style={styles.bannerLine1}>Better questions.</Text>
            <Text style={styles.bannerLine2}>Brighter careers.</Text>
          </View>
        </LinearGradient>
      </View>

      <FlatList
        horizontal
        data={DISCUSSION_CATEGORIES}
        keyExtractor={(c) => c}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => {
          const active = category === item;
          return (
            <Pressable
              onPress={() => onCategory(item)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function ComposerSheet({
  visible,
  authorName,
  profileId,
  skills,
  onClose,
}: {
  visible: boolean;
  authorName: string;
  profileId: string | null;
  skills: string[];
  onClose: () => void;
}) {
  const [topics, setTopics] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const post = usePostDiscussion(profileId, authorName);

  const topicOptions = useMemo(() => {
    const fromSkills = skills.slice(0, 4).map((s) => s[0].toUpperCase() + s.slice(1));
    return [...new Set([...fromSkills, ...POST_TOPICS])];
  }, [skills]);

  const toggleTopic = (t: string) =>
    setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const canPost = question.trim().length >= 8 && !post.isPending;

  const submit = () => {
    if (!canPost) return;
    post.mutate(
      {
        question: question.trim(),
        description: description.trim() || undefined,
        topic: topics[0],
        skills: topics.slice(1).map((t) => t.toLowerCase()),
      },
      {
        onSuccess: () => {
          setTopics([]);
          setQuestion('');
          setDescription('');
          onClose();
        },
      },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Ask the community</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close composer">
              <Glyph name="close" size={18} color={colors.slate500} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>What topics does your question touch?</Text>
            </View>
            <View style={styles.topicChips}>
              {topicOptions.map((t) => {
                const on = topics.includes(t);
                return (
                  <Pressable
                    key={t}
                    onPress={() => toggleTopic(t)}
                    style={[styles.chip, on && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextActive]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>Your question</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g. How do you explain trade-offs in a system design round?"
              placeholderTextColor={colors.slate400}
              value={question}
              onChangeText={setQuestion}
              multiline
            />

            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>Add context (optional)</Text>
            </View>
            <TextInput
              style={[styles.input, styles.inputTall]}
              placeholder="Where did this come up, what did you try…"
              placeholderTextColor={colors.slate400}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </ScrollView>

          <PrimaryButton
            label={post.isPending ? 'Posting…' : 'Post question'}
            onPress={submit}
            disabled={!canPost}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function Discussions() {
  const { profileId, resumeFields } = useOnboarding();
  const [category, setCategory] = useState(DISCUSSION_CATEGORIES[0]);
  const [compose, setCompose] = useState(false);
  const authorName = resumeFields?.name?.trim() || 'You';
  const { data: threads, isLoading, isError, refetch, isRefetching } = useThreads(
    category,
    profileId,
    resumeFields?.name ?? null,
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader />
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingText}>Loading community threads…</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <ThreadCard thread={item} authorName={authorName} />}
          ListHeaderComponent={<TitleBlock category={category} onCategory={setCategory} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Glyph name="discussions-outline" size={26} color={colors.slate400} />
              <Text style={styles.emptyTitle}>
                {isError ? "Can't reach the community backend" : 'Nothing here yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {isError
                  ? 'Start the backend and pull down to retry.'
                  : category === 'For you'
                    ? 'Questions marked "Don\'t know" in onboarding and peer posts appear here.'
                    : `No threads tagged "${category}" yet — be the first to post.`}
              </Text>
            </View>
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.brand}
            />
          }
        />
      )}
      <Pressable
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel="Start a discussion"
        onPress={() => setCompose(true)}
      >
        <Glyph name="pencil" size={22} color="#ffffff" />
      </Pressable>
      <ComposerSheet
        visible={compose}
        authorName={authorName}
        profileId={profileId ?? null}
        skills={resumeFields?.skills ?? []}
        onClose={() => setCompose(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 110, gap: spacing.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13, fontFamily: font.body, color: colors.slate500 },
  empty: { alignItems: 'center', padding: 32, gap: 8, marginTop: 60 },
  emptyTitle: { fontFamily: font.display, fontSize: 18, color: colors.slate900 },
  emptyBody: {
    fontFamily: font.body,
    fontSize: 13,
    color: colors.slate500,
    textAlign: 'center',
    lineHeight: 19,
  },

  titleBlock: { marginBottom: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    paddingTop: 8,
    marginBottom: spacing.md,
  },
  title: { fontFamily: font.display, fontSize: 24, letterSpacing: -0.5, color: colors.slate900 },
  subtitle: { fontSize: 12, fontFamily: font.body, color: colors.slate500, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.teal200,
    padding: 10,
    maxWidth: 172,
    overflow: 'hidden',
  },
  bannerLine1: { fontSize: 11, fontFamily: font.bodySemi, color: colors.slate800, lineHeight: 15 },
  bannerLine2: { fontSize: 11, fontFamily: font.bodySemi, color: colors.teal700, lineHeight: 15 },

  chips: { gap: 8, paddingHorizontal: 4, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.slate600 },
  chipTextActive: { color: '#ffffff', fontFamily: font.bodySemi },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...floatShadow,
  },


  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, position: 'absolute', backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '88%',
    gap: spacing.md,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontFamily: font.display, fontSize: 18, color: colors.slate900 },
  sheetBody: { gap: spacing.sm, paddingBottom: 4 },
  bubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  bubbleText: { fontSize: 13, fontFamily: font.bodySemi, color: colors.slate800 },
  topicChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: font.body,
    color: colors.slate800,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  inputTall: { minHeight: 80 },
});
