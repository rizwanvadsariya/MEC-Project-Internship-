/** Email/password -> AuthProvider.signIn. Backend applies its own rate limits
 *  and lockout policy (Memory.md "Supabase Auth setup" points #5/#8).
 *
 *  Background per ui-implementation.md §2: full-bleed real scheme photos
 *  (water treatment plant, a government school, a highway toll plaza — see
 *  mobile/assets/images/login) crossfading on a loop, with a slow Ken Burns
 *  zoom for a cinematic feel, a bottom scrim for legibility, and a frosted
 *  glass card holding the form so the photos stay the visual lead instead of
 *  a barely-visible texture.
 *
 *  Animated with React Native's built-in `Animated` API, not a third-party
 *  animation library — see Memory.md "Mobile UI theme". Moti pulled in
 *  framer-motion (a DOM-only library with its own mismatched React copy) and
 *  crashed on render. react-native-reanimated was tried next, but it needs a
 *  babel plugin transform that only takes effect after a full Metro
 *  cache-clear restart, and its v4/worklets split has native-module version
 *  requirements that can't be verified without a real device — not something
 *  worth debugging blind. Core `Animated` needs neither a babel plugin nor
 *  any native module beyond what every RN app already has, so it can't be
 *  the reason images fail to show. */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../auth/useAuth';
import { ApiClientError, apiBaseUrl } from '../../api/client';
import { colors, radius, spacing, typography } from '../../theme';

const BACKGROUND_IMAGES = [
  require('../../../assets/images/login/site-1.webp'),
  require('../../../assets/images/login/site-2.webp'),
  require('../../../assets/images/login/site-3.webp'),
];

const CROSSFADE_INTERVAL_MS = 5500;
const CROSSFADE_DURATION_MS = 1500;
const KEN_BURNS_MAX_SCALE = 1.12;

/** Two stacked, fully-visible image layers that swap which one is "front" on
 *  each tick, each slowly zooming for the whole time it's shown. `onActiveImageChange`
 *  reports which of the 3 source images is currently front, for the dot indicator. */
function AnimatedBackground({ onActiveImageChange }: { onActiveImageChange: (index: number) => void }) {
  const [layerImages, setLayerImages] = useState<[number, number]>([0, 1]);
  const frontIsLayerA = useRef(true);
  const nextImageIndex = useRef(2 % BACKGROUND_IMAGES.length);
  const [opacityA] = useState(() => new Animated.Value(1));
  const [opacityB] = useState(() => new Animated.Value(0));
  const [scaleA] = useState(() => new Animated.Value(1));
  const [scaleB] = useState(() => new Animated.Value(1.03));

  useEffect(() => {
    const zoom = (value: Animated.Value) =>
      Animated.timing(value, {
        toValue: KEN_BURNS_MAX_SCALE,
        duration: CROSSFADE_INTERVAL_MS + CROSSFADE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });

    zoom(scaleA).start();

    const id = setInterval(() => {
      const aBecomesFront = !frontIsLayerA.current;
      const upcoming = nextImageIndex.current;
      nextImageIndex.current = (upcoming + 1) % BACKGROUND_IMAGES.length;
      onActiveImageChange(upcoming);

      setLayerImages((prev) => {
        const updated: [number, number] = [...prev];
        updated[aBecomesFront ? 0 : 1] = upcoming;
        return updated;
      });

      const fadeOptions = { duration: CROSSFADE_DURATION_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true };
      Animated.timing(opacityA, { ...fadeOptions, toValue: aBecomesFront ? 1 : 0 }).start();
      Animated.timing(opacityB, { ...fadeOptions, toValue: aBecomesFront ? 0 : 1 }).start();

      const zoomingScale = aBecomesFront ? scaleA : scaleB;
      zoomingScale.setValue(1);
      zoom(zoomingScale).start();

      frontIsLayerA.current = aBecomesFront;
    }, CROSSFADE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [onActiveImageChange, opacityA, opacityB, scaleA, scaleB]);

  return (
    <View style={styles.backgroundRoot} pointerEvents="none">
      <Animated.Image
        source={BACKGROUND_IMAGES[layerImages[0]]}
        resizeMode="cover"
        style={[styles.backgroundImage, { opacity: opacityA, transform: [{ scale: scaleA }] }]}
        onError={(e) => console.warn('[LoginScreen] background image A failed to load:', e.nativeEvent)}
      />
      <Animated.Image
        source={BACKGROUND_IMAGES[layerImages[1]]}
        resizeMode="cover"
        style={[styles.backgroundImage, { opacity: opacityB, transform: [{ scale: scaleB }] }]}
        onError={(e) => console.warn('[LoginScreen] background image B failed to load:', e.nativeEvent)}
      />
      <LinearGradient
        style={styles.backgroundImage}
        colors={['rgba(27,46,30,0.55)', 'rgba(27,46,30,0.15)', 'rgba(27,46,30,0.15)', 'rgba(15,26,17,0.92)']}
        locations={[0, 0.32, 0.55, 1]}
      />
    </View>
  );
}

function LoginButton({ onPress, disabled, submitting }: { onPress: () => void; disabled: boolean; submitting: boolean }) {
  const [pressScale] = useState(() => new Animated.Value(1));

  return (
    <Animated.View style={{ transform: [{ scale: pressScale }] }}>
      <Pressable
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          Animated.timing(pressScale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
        }}
        onPressOut={() => {
          Animated.timing(pressScale, { toValue: 1, duration: 150, useNativeDriver: true }).start();
        }}
      >
        {submitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Text style={styles.buttonText}>Log in</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} style={styles.buttonIcon} />
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  const [brandOpacity] = useState(() => new Animated.Value(0));
  const [brandTranslate] = useState(() => new Animated.Value(-12));
  const [cardOpacity] = useState(() => new Animated.Value(0));
  const [cardTranslate] = useState(() => new Animated.Value(28));

  useEffect(() => {
    const entrance = (value: Animated.Value, toValue: number, duration: number, delay: number) =>
      Animated.timing(value, { toValue, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });

    Animated.parallel([
      entrance(brandOpacity, 1, 700, 0),
      entrance(brandTranslate, 0, 700, 0),
      entrance(cardOpacity, 1, 650, 180),
      entrance(cardTranslate, 0, 650, 180),
    ]).start();
  }, [brandOpacity, brandTranslate, cardOpacity, cardTranslate]);

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.message);
      else setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.flex}>
      <AnimatedBackground onActiveImageChange={setActiveImage} />

      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.brandArea}>
            <Animated.View style={{ opacity: brandOpacity, transform: [{ translateY: brandTranslate }] }}>
              <View style={styles.logoBadge}>
                <Text style={styles.logoText}>M&E</Text>
              </View>
              <Text style={styles.title}>Smart Provincial M&E</Text>
              <Text style={styles.subtitle}>Sindh Secretariat — Scheme Monitoring</Text>
            </Animated.View>

            <View style={styles.dotsRow}>
              {BACKGROUND_IMAGES.map((_, i) => (
                <View key={i} style={[styles.dot, i === activeImage && styles.dotActive]} />
              ))}
            </View>
          </View>

          <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] }]}>
            <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill} />
            <View style={styles.cardOverlay} />
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>Sign in</Text>

              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@mec.local"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={!submitting}
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithTrailingIcon]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  editable={!submitting}
                />
                <Pressable
                  hitSlop={10}
                  style={styles.inputTrailingIcon}
                  onPress={() => setShowPassword((v) => !v)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <LoginButton onPress={onSubmit} disabled={submitting} submitting={submitting} />
            </View>
          </Animated.View>

          <Text style={styles.hint}>API: {apiBaseUrl}</Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.textPrimary },
  backgroundRoot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0d1a10' },
  backgroundImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  brandArea: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: spacing.lg },
  logoBadge: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  logoText: { color: colors.white, fontWeight: typography.weight.bold, fontSize: typography.size.md, letterSpacing: 0.5 },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.white,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  dotsRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: colors.white, width: 18 },

  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  cardContent: { padding: spacing.lg },
  cardTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.primaryDark,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    marginBottom: spacing.xs + 2,
    marginTop: spacing.md,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(241,248,242,0.9)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md - 4,
  },
  inputIcon: { marginRight: spacing.xs },
  input: {
    flex: 1,
    color: colors.textPrimary,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.size.md,
  },
  inputWithTrailingIcon: { paddingRight: 0 },
  inputTrailingIcon: { padding: spacing.xs },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  error: { color: colors.error, fontSize: typography.size.sm, flexShrink: 1 },
  button: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: spacing.md - 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: typography.weight.medium, fontSize: typography.size.md },
  buttonIcon: { marginLeft: spacing.xs },
  hint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: typography.size.xs,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
