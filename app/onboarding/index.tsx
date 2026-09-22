import React, { useCallback, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Glyph } from '@/components/Glyph';
import {
  ChatBubble,
  PrimaryButton,
  StageFooterContext,
  SweepIn,
  UserPill,
} from '@/components/onboarding';
import { CONNECTORS, TIMELINE_OPTIONS, type Connector } from '@/data/mock';
import { formatTime } from '@/lib/time';
import { useOnboarding } from '@/state/onboarding';
import { colors, font, radius, spacing } from '@/theme/tokens';

import { ConnectorsRecap, ResumeStage } from './resume';
import { CredentialsPill, ResumeRecap, TimelineStage } from './timeline';
import { ProfileStage } from './profile';

function ConnectorTile({ connector, selected, onToggle }: { connector: Connector; selected: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onToggle}
      style={[styles.tile, selected && styles.tileSelected]}
    >
      <View style={styles.tileLeft}>
        <View style={[styles.tileIcon, { backgroundColor: connector.color }]}>
          {connector.badge ? (
            <Text style={[styles.tileBadge, connector.textOnColor && { color: connector.textOnColor }]}>
              {connector.badge}
            </Text>
          ) : (
            <Glyph name={connector.icon ?? 'info'} size={16} color={connector.textOnColor ?? '#ffffff'} />
          )}
        </View>
        <Text style={styles.tileName} numberOfLines={1}>
          {connector.name}
        </Text>
      </View>
      <View style={[styles.tileCheck, selected && styles.tileCheckOn]}>
        {selected ? <Glyph name="check" size={13} color="#ffffff" /> : null}
      </View>
    </Pressable>
  );
}

function ConnectorsStage({ onDone }: { onDone: () => void }) {
  const { connectors, toggleConnector } = useOnboarding();

  return (
    <>
      <SweepIn delay={80}>
        <ChatBubble
          title="Let's set up your job scout!"
          body="I'll ask you a few quick questions to personalize your search."
        />
      </SweepIn>
      <SweepIn delay={200}>
        <ChatBubble
          title="1. Which job connectors do you want to include in your search?"
          body="Select all that apply. We'll search across your chosen platforms for the best opportunities."
        />
      </SweepIn>

      <SweepIn delay={320}>
        <View style={styles.grid}>
          {CONNECTORS.map((c) => (
            <ConnectorTile
              key={c.id}
              connector={c}
              selected={connectors.includes(c.id)}
              onToggle={() => toggleConnector(c.id)}
            />
          ))}
        </View>
      </SweepIn>

      <SweepIn delay={440}>
        <UserPill
          text={`Selected ${connectors.length} connector${connectors.length === 1 ? '' : 's'}`}
        />
      </SweepIn>

      <SweepIn delay={560} style={styles.ctaArea}>
        <PrimaryButton label="Continue" disabled={connectors.length === 0} onPress={onDone} />
        <Text style={styles.caption}>You can always change these settings later.</Text>
      </SweepIn>
    </>
  );
}

function ConnectorsHistory() {
  const { connectors, connectorsAt } = useOnboarding();
  const selected = CONNECTORS.filter((c) => connectors.includes(c.id));
  return (
    <>
      <ChatBubble
        title="Step 1 • Connectors"
        body={`Connected ${selected.length} scout platforms.`}
        time={connectorsAt ? formatTime(connectorsAt) : undefined}
      >
        <View style={styles.recapChips}>
          {selected.map((c) => (
            <View key={c.id} style={styles.recapChip}>
              <View style={styles.recapChipDot} />
              <Text style={styles.recapChipText}>{c.name}</Text>
            </View>
          ))}
        </View>
      </ChatBubble>
      <ConnectorsRecap />
    </>
  );
}

function TimelineRecap() {
  const { timeline } = useOnboarding();
  const opt = TIMELINE_OPTIONS.find((o) => o.id === timeline) ?? TIMELINE_OPTIONS[0];
  return (
    <>
      <ChatBubble
        title="Step 3 • Hiring Timeline:"
        body={`${opt.label} (${opt.detail}) confirmed.`}
      />
      <UserPill icon="check" text="Ready for profile setup" />
    </>
  );
}

function ChatHeader({ step }: { step: number }) {
  return (
    <View style={styles.headerWrap}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <View style={styles.headerDot} />
          <Text style={styles.headerTitle}>Onboarding AI Scout</Text>
        </View>
        <Text style={styles.headerStep}>Step {step} of 4</Text>
      </View>
      <View style={styles.progressTrack}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.progressSeg, i < step && styles.progressSegDone]} />
        ))}
      </View>
    </View>
  );
}

export default function OnboardingChat() {
  const { stage, setStage, completeConnectors } = useOnboarding();
  const scrollRef = useRef<ScrollView>(null);
  const [footer, setFooter] = useState<React.ReactNode>(null);

  const scrollDown = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);


  const advance = useCallback(
    (n: number) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setStage(n);
    },
    [setStage],
  );

  return (
    <StageFooterContext.Provider value={setFooter}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.headPad}>
          <ChatHeader step={stage + 1} />
        </View>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollDown}
        >
          {stage === 0 ? (
            <ConnectorsStage
              onDone={() => {
                completeConnectors();
                advance(1);
              }}
            />
          ) : (
            <SweepIn>
              <ConnectorsHistory />
            </SweepIn>
          )}

          {stage >= 1 ? (
            stage === 1 ? (
              <ResumeStage onDone={() => advance(2)} />
            ) : (
              <>
                <SweepIn>
                  <ResumeRecap />
                </SweepIn>
                <SweepIn delay={100}>
                  <CredentialsPill />
                </SweepIn>
              </>
            )
          ) : null}

          {stage >= 2 ? (
            stage === 2 ? (
              <TimelineStage onDone={() => advance(3)} />
            ) : (
              <SweepIn>
                <TimelineRecap />
              </SweepIn>
            )
          ) : null}

          {stage >= 3 ? <ProfileStage /> : null}
        </ScrollView>
        {footer}
      </SafeAreaView>
    </StageFooterContext.Provider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  headPad: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  scroll: { padding: spacing.lg, gap: spacing.xxl, flexGrow: 1, justifyContent: 'flex-end' },

  headerWrap: { gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  headerTitle: { fontFamily: font.displaySemi, fontSize: 13, letterSpacing: -0.2, color: colors.ink },
  headerStep: { fontFamily: font.bodyMedium, fontSize: 12, color: colors.slate500 },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceHigh },
  progressSegDone: { backgroundColor: colors.brand },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginLeft: 48,
  },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 14,
    gap: 8,
  },
  tileSelected: { borderColor: colors.brand },
  tileLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  tileIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadge: { color: '#ffffff', fontSize: 14, fontFamily: font.bodyExtra },
  tileName: { fontSize: 14, fontFamily: font.bodyMedium, color: colors.ink, flexShrink: 1 },
  tileCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCheckOn: { backgroundColor: colors.brand },

  recapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  recapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recapChipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  recapChipText: { fontSize: 12, fontFamily: font.bodyMedium, color: colors.ink },
  ctaArea: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  caption: { fontSize: 12, fontFamily: font.body, color: colors.slate500, textAlign: 'center' },
});
