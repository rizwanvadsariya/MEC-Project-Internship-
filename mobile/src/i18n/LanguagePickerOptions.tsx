/**
 * The actual language option list + restart notice, extracted out of
 * LanguageSettingsScreen so the exact same picker logic can also be rendered
 * inside LanguageSwitcherButton's quick-access modal (Step 22 follow-up: a
 * language button/icon must be reachable from every route, not just via a
 * single "Language" menu item on RoleHomeScreen) — one shared implementation,
 * not two copies that can drift apart.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLanguage } from './useLanguage';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './languages';
import { colors, radius, spacing, typography } from '../theme';

const LANGUAGE_LABEL_KEY: Record<SupportedLanguage, string> = {
  en: 'languageSettings.english',
  ur: 'languageSettings.urdu',
  sd: 'languageSettings.sindhi',
};

export default function LanguagePickerOptions({ onLanguageChosen }: { onLanguageChosen?: (language: SupportedLanguage) => void }) {
  const { t } = useTranslation();
  const { language, restartNeeded, setLanguage, restartNow } = useLanguage();
  const [switching, setSwitching] = useState<SupportedLanguage | null>(null);

  const choose = async (next: SupportedLanguage) => {
    if (next === language) {
      onLanguageChosen?.(next);
      return;
    }
    setSwitching(next);
    try {
      await setLanguage(next);
      onLanguageChosen?.(next);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <View>
      {SUPPORTED_LANGUAGES.map((code) => {
        const selected = code === language;
        return (
          <Pressable
            key={code}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => { void choose(code); }}
            disabled={switching !== null}
          >
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{t(LANGUAGE_LABEL_KEY[code])}</Text>
            {switching === code ? <ActivityIndicator color={colors.primary} /> : selected ? <Text style={styles.checkmark}>✓</Text> : null}
          </Pressable>
        );
      })}

      {restartNeeded ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t('languageSettings.restartNoticeTitle')}</Text>
          <Text style={styles.noticeBody}>{t('languageSettings.restartNoticeBody')}</Text>
          <Pressable style={styles.restartButton} onPress={() => { void restartNow(); }}>
            <Text style={styles.restartButtonText}>{t('languageSettings.restartNowButton')}</Text>
          </Pressable>
          <Text style={styles.restartHint}>{t('languageSettings.restartLaterHint')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  optionSelected: { borderColor: colors.primary },
  optionText: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.medium },
  optionTextSelected: { color: colors.primaryDark, fontWeight: typography.weight.bold },
  checkmark: { color: colors.primary, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  notice: { backgroundColor: '#FFF8E1', borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  noticeTitle: { color: '#7A5700', fontWeight: typography.weight.bold, marginBottom: spacing.xs },
  noticeBody: { color: '#7A5700', fontSize: typography.size.xs, lineHeight: typography.lineHeight.md },
  restartButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.sm, paddingVertical: spacing.sm, marginTop: spacing.md },
  restartButtonText: { color: colors.white, fontWeight: typography.weight.bold },
  restartHint: { color: '#7A5700', fontSize: typography.size.xs, marginTop: spacing.sm },
});
