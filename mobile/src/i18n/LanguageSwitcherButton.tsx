/**
 * Step 22 follow-up: a language icon must be reachable from every route for
 * every role, not just via a "Language" menu item on RoleHomeScreen (user
 * feedback after the first pass). This is the universal entry point —
 * mounted as `headerRight` in every role navigator's shared screenOptions
 * (so it appears on every screen's header automatically, without touching
 * each of the ~19 screens individually) and rendered as a floating button on
 * LoginScreen, which has `headerShown: false` and its own custom chrome.
 *
 * Two variants, same underlying modal + LanguagePickerOptions:
 * - "header": a small icon sized for the native-stack header, tinted to
 *   match `stackScreenOptions.headerTintColor` (colors.white).
 * - "floating": a circular semi-transparent button for screens with no
 *   header (currently just LoginScreen), matching that screen's existing
 *   frosted/translucent visual language.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import LanguagePickerOptions from './LanguagePickerOptions';
import { colors, radius, spacing, typography } from '../theme';

export default function LanguageSwitcherButton({ variant = 'header' }: { variant?: 'header' | 'floating' }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={variant === 'floating' ? styles.floatingButton : styles.headerButton}
        accessibilityRole="button"
        accessibilityLabel={t('languageSettings.title')}
        hitSlop={8}
      >
        <Ionicons name="language-outline" size={variant === 'floating' ? 22 : 24} color={colors.white} />
      </Pressable>

      <Modal visible={visible} animationType="fade" transparent onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('languageSettings.title')}</Text>
              <Pressable onPress={() => setVisible(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.sheetSubtitle}>{t('languageSettings.subtitle')}</Text>
            <LanguagePickerOptions />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  floatingButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  sheetTitle: { color: colors.textPrimary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
  sheetSubtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginBottom: spacing.lg },
});
