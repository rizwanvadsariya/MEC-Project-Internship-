import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadow, spacing, typography } from '../../theme';

type Variant = 'primary' | 'danger' | 'ghost';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
};

/** Rounded, soft-shadowed button matching the login screen's submit button. */
export default function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  icon,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? colors.primaryDark : colors.white} />
      ) : (
        <>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={variant === 'ghost' ? colors.primaryDark : colors.white}
              style={styles.icon}
            />
          ) : null}
          <Text
            style={[
              styles.label,
              variant === 'danger' && styles.dangerLabel,
              variant === 'ghost' && styles.ghostLabel,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.buttonPrimary,
    ...shadow.button,
  },
  danger: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.error,
  },
  ghost: {
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.65,
  },
  icon: {
    marginRight: spacing.sm,
  },
  label: {
    color: colors.white,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    letterSpacing: 0.4,
  },
  dangerLabel: {
    color: colors.error,
  },
  ghostLabel: {
    color: colors.primaryDark,
  },
});
