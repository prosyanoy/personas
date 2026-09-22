import React, { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useChat, type UIMessage } from '@tanstack/ai-react';

import { Glyph } from '@/components/Glyph';
import { makeSupportConnection } from '@/llm/support';
import { llmReady, useLlmState } from '@/llm/model';
import { useOnboarding } from '@/state/onboarding';
import { colors, font, radius, spacing } from '@/theme/tokens';

function textOf(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: 'text'; content: string } => p.type === 'text')
    .map((p) => p.content)
    .join('')
    .trim();
}

export default function SupportScreen() {
  const router = useRouter();
  const { resumeFields } = useOnboarding();
  const llm = useLlmState();
  const profileRef = useRef(resumeFields);
  profileRef.current = resumeFields;


  const connection = useMemo(() => makeSupportConnection(() => profileRef.current), []);
  const { messages, sendMessage, isLoading } = useChat({ connection });
  const [input, setInput] = useState('');

  const send = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    void sendMessage(text);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Glyph name="arrow-back" size={18} color={colors.slate700} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Support Agent</Text>
          <Text style={styles.subtitle}>
            {llm.status === 'ready' && llmReady()
              ? 'Gemma-4 · answers on this device'
              : 'On-device assistant · model optional'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.notice}>
              <Glyph name="sparkle" size={13} color={colors.brand} />
              <Text style={styles.noticeText}>
                Ask anything about sources, matching, or your data. Replies are generated on this
                device — nothing is sent to a server.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const text = textOf(item);
            if (!text) return null;
            const mine = item.role === 'user';
            return (
              <View style={[styles.row, mine && styles.rowMine]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.msgText, mine && styles.msgTextMine]}>{text}</Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            isLoading ? (
              <View style={styles.row}>
                <View style={[styles.bubble, styles.bubbleTheirs]}>
                  <Text style={styles.typing}>thinking…</Text>
                </View>
              </View>
            ) : null
          }
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ask the support agent…"
            placeholderTextColor={colors.slate400}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            returnKeyType="send"
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={send}
            disabled={!input.trim() || isLoading}
            style={[styles.sendBtn, (!input.trim() || isLoading) && { opacity: 0.5 }]}
          >
            <Glyph name="send" size={16} color="#ffffff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate200,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.slate200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { fontFamily: font.display, fontSize: 17, color: colors.slate900 },
  subtitle: { fontSize: 11, fontFamily: font.mono, color: colors.slate500, marginTop: 1 },

  list: { padding: spacing.lg, gap: 10, paddingBottom: 16 },
  notice: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.brand50 ?? '#eef4ff',
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 6,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: font.body,
    color: colors.slate600,
    lineHeight: 17,
  },

  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleTheirs: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.slate200,
    borderTopLeftRadius: 4,
  },
  bubbleMine: { backgroundColor: colors.brand, borderTopRightRadius: 4 },
  msgText: { fontSize: 13, fontFamily: font.body, color: colors.slate800, lineHeight: 19 },
  msgTextMine: { color: '#ffffff' },
  typing: { fontSize: 12, fontFamily: font.mono, color: colors.slate500 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: spacing.lg,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate200,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: font.body,
    color: colors.slate800,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
