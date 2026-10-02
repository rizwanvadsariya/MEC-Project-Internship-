import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme';

type Props = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  tone?: 'default' | 'danger';
};

/** Icon + label + chevron row for settings/menu-style lists (e.g. More screen). */
export default function ListRow({ label, icon, onPress, tone = 'default' }: Props) {
  const isDanger = tone === 'danger';
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.left}>
        {icon ? (
          <Ionicons name={icon} size={20} color={isDanger ? colors.error : colors.primaryDark} style={styles.icon} />
        ) : null}
        <Text style={[styles.label, isDanger && styles.dangerLabel]}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    marginRight: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },
  dangerLabel: {
    color: colors.error,
  },
});
