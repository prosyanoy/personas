import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph } from '@/components/Glyph';
import { colors, font, radius } from '@/theme/tokens';

export function AppHeader({ onSearch }: { onSearch?: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={styles.logoBox}>
          <Glyph name="flame" size={20} color={colors.amber500} />
        </View>
        <Text style={styles.wordmark}>Personas</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search jobs"
          onPress={onSearch}
          style={styles.iconBtn}
        >
          <Glyph name="search" size={20} color={colors.slate700} />
        </Pressable>
        <View style={styles.iconBtn}>
          <Glyph name="bell" size={20} color={colors.slate700} />
          <View style={styles.dot} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: colors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.slate100,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.amber50,
    borderWidth: 1,
    borderColor: colors.amber100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: font.displayExtra,
    fontSize: 18,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.emerald500,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});
