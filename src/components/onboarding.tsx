import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Glyph } from '@/components/Glyph';
import { now } from '@/lib/time';
import { colors, font, radius } from '@/theme/tokens';

export const StageFooterContext = React.createContext<
  React.Dispatch<React.SetStateAction<React.ReactNode>>
>(() => {});

export function SweepIn({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(delay <= 0);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const play = () => {
      void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          anim.setValue(1);
          return;
        }
        Animated.spring(anim, {
          toValue: 1,
          stiffness: 170,
          damping: 26,
          mass: 1,
          useNativeDriver: true,
        }).start();
      });
    };
    if (delay <= 0) {
      play();
    } else {
      timer = setTimeout(() => {
        if (cancelled) return;
        setShown(true);
        play();
      }, delay);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [anim, delay]);
  if (!shown) return null;
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function StepHeader({ label, step, total = 4 }: { label: string; step: number; total?: number }) {
  return (
    <View style={styles.headerWrap}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>{label}</Text>
        <Text style={styles.headerStep}>
          Step {step} of {total}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.progressSegment, i < step && styles.progressSegmentDone]} />
        ))}
      </View>
    </View>
  );
}

export function TorchAvatar() {
  return (
    <View style={styles.avatar}>
      <Glyph name="flame" size={18} color={colors.onPrimaryFixed} />
    </View>
  );
}

export function ChatBubble({
  title,
  body,
  time,
  children,
}: {
  title?: string;
  body?: string;

  time?: string;
  children?: React.ReactNode;
}) {
  const [stamp] = React.useState(() => time ?? now());
  return (
    <View style={styles.bubbleRow}>
      <TorchAvatar />
      <View style={styles.bubbleSide}>
        <View style={styles.bubble}>
          {title ? <Text style={styles.bubbleTitle}>{title}</Text> : null}
          {body ? <Text style={styles.bubbleBody}>{body}</Text> : null}
          {children}
        </View>
        <Text style={styles.timestamp}>{stamp}</Text>
      </View>
    </View>
  );
}

export function UserPill({ icon = 'task-alt', text, time }: { icon?: string; text: string; time?: string }) {
  const [stamp] = React.useState(() => time ?? now());
  return (
    <View style={styles.userPillWrap}>
      <View style={styles.userPill}>
        <Glyph name={icon} size={16} color={colors.brand} />
        <Text style={styles.userPillText}>{text}</Text>
      </View>
      <View style={styles.userMeta}>
        <Text style={styles.timestamp}>{stamp}</Text>
        <Glyph name="done-all" size={13} color={colors.brand} />
      </View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cta,
        disabled && styles.ctaDisabled,
        pressed && !disabled && { backgroundColor: colors.brandHover, transform: [{ scale: 0.99 }] },
      ]}
    >
      <Text style={styles.ctaLabel}>{label}</Text>
      <Glyph name="arrow-forward" size={18} color="#ffffff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerWrap: { gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLabel: {
    fontFamily: font.displaySemi,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.brand,
  },
  headerStep: { fontFamily: font.mono, fontSize: 12, color: colors.slate500 },
  progressTrack: {
    flexDirection: 'row',
    height: 6,
    gap: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressSegment: { flex: 1, borderRadius: radius.full, backgroundColor: colors.surfaceHigh },
  progressSegmentDone: { backgroundColor: colors.brand },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleRow: { flexDirection: 'row', gap: 12 },
  bubbleSide: { flex: 1, alignItems: 'flex-start' },
  bubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderTopLeftRadius: 0,
    padding: 16,
    maxWidth: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleTitle: {
    fontFamily: font.bodySemi,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 4,
  },
  bubbleBody: {
    fontFamily: font.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.slate600,
  },
  timestamp: { fontFamily: font.body, fontSize: 11, color: colors.slate500, marginTop: 4, marginLeft: 4 },

  userPillWrap: { alignItems: 'flex-end', gap: 4 },
  userPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.xl,
    borderTopRightRadius: 0,
    backgroundColor: colors.primaryContainer,
  },
  userPillText: { fontFamily: font.bodyMedium, fontSize: 13, color: colors.onPrimaryFixed },
  userMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },

  cta: {
    width: '100%',
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaLabel: { fontFamily: font.displaySemi, fontSize: 16, color: '#ffffff' },
});
