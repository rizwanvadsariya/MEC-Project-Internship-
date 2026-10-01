/* eslint-disable */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  Image,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../auth/useAuth';
import { ApiClientError, apiBaseUrl } from '../../api/client';
import { colors, spacing } from '../../theme';
import LanguageSwitcherButton from '../../i18n/LanguageSwitcherButton';

const BACKGROUND_IMAGES = [
  require('../../../assets/images/login/site-1.png'),
  require('../../../assets/images/login/site-2.png'),
  require('../../../assets/images/login/site-3.png'),
];

const CROSSFADE_INTERVAL_MS = 8000;
const CROSSFADE_DURATION_MS = 2500;
const KEN_BURNS_MAX_SCALE = 1.08;

interface BackgroundLayers {
  layerA: number;
  layerB: number;
}

export type VerificationStatus = 'idle' | 'verifying' | 'success' | 'error';

function VerificationOverlay({ status }: { status: VerificationStatus }) {
  const [isVisible, setIsVisible] = useState(false);
  const [displayedText, setDisplayedText] = useState("Verifying...");
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const spinValue = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(1)).current;
  const textTranslateY = useRef(new Animated.Value(0)).current;

  // Track vs Full Ring Opacity
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.9)).current;
  const spinnerOpacity = useRef(new Animated.Value(1)).current;

  const spinAnimation = useRef(
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
  ).current;

  useEffect(() => {
    if (status === 'verifying') {
      setIsVisible(true);
      setDisplayedText("Verifying...");
      iconScale.setValue(0);
      shakeX.setValue(0);
      ringOpacity.setValue(0);
      ringScale.setValue(0.9);
      spinnerOpacity.setValue(1);
      textOpacity.setValue(1);
      textTranslateY.setValue(0);

      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
      spinAnimation.start();
    } else if (status === 'success' || status === 'error') {
      const isError = status === 'error';
      const isSuccess = status === 'success';
      const nextText = isSuccess ? "Verified" : "Incorrect Password";

      setTimeout(() => {
        setDisplayedText(nextText);
      }, 120);

      const sequence = [];

      sequence.push(
        Animated.parallel([
          Animated.timing(spinnerOpacity, {
            toValue: 0,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.spring(ringScale, {
            toValue: 1,
            friction: 6,
            tension: 70,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(textOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(textTranslateY, { toValue: 8, duration: 0, useNativeDriver: true }),
            Animated.parallel([
              Animated.timing(textOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
              Animated.timing(textTranslateY, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            ])
          ]),
          Animated.spring(iconScale, {
            toValue: 1,
            friction: 5,
            tension: 65,
            useNativeDriver: true,
          }),
        ])
      );

      if (isError) {
        sequence.push(
          Animated.sequence([
            Animated.timing(shakeX, { toValue: 12, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -12, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 12, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -12, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 12, duration: 45, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 0, duration: 45, useNativeDriver: true }),
          ])
        );
      }

      Animated.sequence(sequence).start(() => {
        spinAnimation.stop();
      });
    } else if (status === 'idle') {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setIsVisible(false);
        spinAnimation.stop();
      });
    }
  }, [status, overlayOpacity, iconScale, shakeX, ringOpacity, ringScale, spinnerOpacity, spinAnimation, textOpacity, textTranslateY]);

  if (!isVisible && status === 'idle') return null;

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const isSuccess = status === 'success';
  const finalColor = isSuccess ? '#34C759' : '#FF3B30';

  return (
    <Animated.View style={[styles.overlayContainer, { opacity: overlayOpacity }]} pointerEvents="auto">
      <Animated.View style={[styles.centerContainer, { transform: [{ translateX: shakeX }] }]}>

        <View style={styles.neonRingContainer}>
          {/* Base Static Track */}
          <View style={[styles.ringBase, styles.ringTrack]} />

          {/* Spinning Arc */}
          <Animated.View
            style={[
              styles.ringBase,
              styles.ringSpinner,
              {
                opacity: spinnerOpacity,
                transform: [{ rotate: spin }],
                ...Platform.select({
                  ios: {
                    shadowColor: '#FFFFFF',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.3,
                    shadowRadius: 10,
                  },
                  android: {
                    elevation: 0,
                  },
                }),
              }
            ]}
          />

          {/* Solid Colored Ring (Fades in) */}
          <Animated.View
            style={[
              styles.ringBase,
              {
                borderColor: finalColor,
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
                ...Platform.select({
                  ios: {
                    shadowColor: finalColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.20,
                    shadowRadius: 10,
                  },
                  android: {
                    elevation: 0,
                  },
                }),
              }
            ]}
          />

          {/* Center Icon */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.iconCenter, { transform: [{ scale: iconScale }] }]}>
            <Ionicons
              name={isSuccess ? "checkmark" : "close"}
              size={82}
              color={finalColor}
              style={{
                textShadowColor: finalColor,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 10,
              }}
            />
          </Animated.View>
        </View>

        {/* Text Container: Always present in layout */}
        <View style={styles.textContainer}>
          <Animated.Text style={[styles.neonText, { opacity: textOpacity, transform: [{ translateY: textTranslateY }] }]}>
            {displayedText}
          </Animated.Text>
        </View>

      </Animated.View>
    </Animated.View>
  );
}

/** Background crossfade with continuous Ken Burns zoom */
function AnimatedBackground() {
  const [layers, setLayers] = useState<BackgroundLayers>({
    layerA: 0,
    layerB: 1,
  });

  const frontIsLayerA = useRef(true);
  const nextImageIndex = useRef(2 % BACKGROUND_IMAGES.length);

  const opacityA = useRef(new Animated.Value(1)).current;
  const opacityB = useRef(new Animated.Value(0)).current;
  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1.03)).current;
  const gradientOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const zoom = (value: Animated.Value) =>
      Animated.timing(value, {
        toValue: KEN_BURNS_MAX_SCALE,
        duration: CROSSFADE_INTERVAL_MS + CROSSFADE_DURATION_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });

    zoom(scaleA).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(gradientOpacity, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(gradientOpacity, {
          toValue: 0.7,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        })
      ])
    ).start();

    const id = setInterval(() => {
      const aBecomesFront = !frontIsLayerA.current;
      const upcoming = nextImageIndex.current;
      nextImageIndex.current = (upcoming + 1) % BACKGROUND_IMAGES.length;

      setLayers((prev) => ({
        layerA: aBecomesFront ? upcoming : prev.layerA,
        layerB: aBecomesFront ? prev.layerB : upcoming,
      }));

      const fadeOptions = {
        duration: CROSSFADE_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      };

      Animated.timing(opacityA, { ...fadeOptions, toValue: aBecomesFront ? 1 : 0 }).start();
      Animated.timing(opacityB, { ...fadeOptions, toValue: aBecomesFront ? 0 : 1 }).start();

      const zoomingScale = aBecomesFront ? scaleA : scaleB;
      zoomingScale.setValue(1);
      zoom(zoomingScale).start();

      frontIsLayerA.current = aBecomesFront;
    }, CROSSFADE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [opacityA, opacityB, scaleA, scaleB]);

  const defaultImage = BACKGROUND_IMAGES[0];
  const sourceA = BACKGROUND_IMAGES[layers.layerA] ?? defaultImage;
  const sourceB = BACKGROUND_IMAGES[layers.layerB] ?? defaultImage;

  return (
    <View style={styles.backgroundRoot} pointerEvents="none">
      <Animated.View style={[styles.backgroundImage, { opacity: opacityA, transform: [{ scale: scaleA }] }]}>
        <Image
          source={sourceA}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.backgroundImage, { opacity: opacityB, transform: [{ scale: scaleB }] }]}>
        <Image
          source={sourceB}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: gradientOpacity }]}>
        <LinearGradient
          colors={['rgba(9, 43, 25, 1)', 'transparent', 'transparent', 'rgba(9, 43, 25, 1)']}
          locations={[0, 0.45, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>('idle');

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const storedEmail = await SecureStore.getItemAsync('rememberedEmail');
        if (storedEmail) {
          setEmail(storedEmail);
          setRememberMe(true);
        } else {
          setRememberMe(false);
        }
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const logoScale = useRef(new Animated.Value(1.8)).current;
  const logoTranslateY = useRef(new Animated.Value(180)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(15)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(100)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  const buttonScale = useRef(new Animated.Value(1)).current;
  const initialButtonWidth = Dimensions.get('window').width - (spacing.lg * 4);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 960, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, friction: 7, tension: 30, useNativeDriver: true }),
        Animated.spring(logoTranslateY, { toValue: 0, friction: 8, tension: 30, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(textTranslateY, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(cardTranslateY, { toValue: 0, friction: 7, tension: 30, useNativeDriver: true }),
      ]),
    ]).start();
  }, [logoOpacity, logoScale, textOpacity, textTranslateY, cardOpacity, cardTranslateY]);

  const handlePressIn = () => {
    if (submitting) return;
    Animated.spring(buttonScale, {
      toValue: 0.97,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (submitting) return;
    Animated.spring(buttonScale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const onSubmit = async () => {
    if (submitting) return;
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your credentials.');
      return;
    }
    setSubmitting(true);
    setVerificationStatus('verifying');

    try {
      if (rememberMe) {
        await SecureStore.setItemAsync('rememberedEmail', email.trim().toLowerCase());
      } else {
        await SecureStore.deleteItemAsync('rememberedEmail');
      }

      const startTime = Date.now();
      await signIn(email.trim().toLowerCase(), password, async () => {
        const elapsed = Date.now() - startTime;
        if (elapsed < 1200) await new Promise(r => setTimeout(r, 1200 - elapsed));
        setVerificationStatus('success');
        await new Promise(r => setTimeout(r, 1400));
      });

    } catch (e) {
      setVerificationStatus('error');

      if (e instanceof ApiClientError) setError(e.message);
      else setError('Invalid email or password. Please try again.');

      timeoutRef.current = setTimeout(() => {
        setVerificationStatus('idle');
        setSubmitting(false);
      }, 1800);
    }
  };

  return (
    <View style={styles.root}>
      <AnimatedBackground />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.languageButtonWrapper}>
          <LanguageSwitcherButton variant="floating" />
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.headerContainer}>
              <Animated.View
                style={{
                  opacity: logoOpacity,
                  transform: [{ translateY: logoTranslateY }, { scale: logoScale }],
                  alignItems: 'center',
                }}
              >
                  <Image
                    source={require('../../../assets/images/login/edit_logo.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
              </Animated.View>

              <Animated.View
                style={{
                  opacity: textOpacity,
                  transform: [{ translateY: textTranslateY }],
                  alignItems: 'center',
                  marginTop: spacing.md,
                }}
              >
                <Text style={styles.mainTitle}>Smart Provincial M&E</Text>
                <Text style={styles.subtitle}>Sindh Secretariat</Text>
              </Animated.View>
            </View>

            <Animated.View
              style={[
                styles.card,
                {
                  opacity: cardOpacity,
                  transform: [{ translateY: cardTranslateY }],
                },
              ]}
            >
              <Text style={styles.cardHeader}>Sign in</Text>

              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color="#5a7a63"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Username"
                  placeholderTextColor="#7f9986"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  editable={!submitting}
                />
              </View>

              <View style={[styles.inputContainer, { marginTop: spacing.md }]}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color="#5a7a63"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="Password"
                  placeholderTextColor="#7f9986"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  editable={!submitting}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={18}
                    color="#5a7a63"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={styles.rememberMeContainer}
                  onPress={() => setRememberMe(!rememberMe)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={rememberMe ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={rememberMe ? '#1e6b37' : '#7f9986'}
                  />
                  <Text style={styles.rememberText}>Remember me</Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Animated.View style={{ transform: [{ scale: buttonScale }], marginTop: spacing.lg, alignItems: 'center' }}>
                <Pressable
                  onPress={onSubmit}
                  onPressIn={handlePressIn}
                  onPressOut={handlePressOut}
                  disabled={submitting}
                >
                  <Animated.View style={[styles.loginButton, submitting && styles.loginButtonDisabled, { width: initialButtonWidth, borderRadius: 12 }]}>
                    <Text style={styles.loginButtonText}>Log in</Text>
                  </Animated.View>
                </Pressable>
              </Animated.View>
            </Animated.View>

            <Text style={styles.apiHint}>API: {apiBaseUrl}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <VerificationOverlay status={verificationStatus} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a1a0f',
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-around',
    paddingBottom: spacing.md,
  },
  backgroundRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0a1a0f',
    overflow: 'hidden',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  languageButtonWrapper: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 20,
  },
  headerContainer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  logoRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: '#cce6d2',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 50
  },
  mainTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginTop: 4,
  },

  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    borderRadius: 24,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a3322',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f8f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeade',
    paddingHorizontal: spacing.md,
    height: 48,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a2e1f',
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: spacing.xs,
  },

  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingHorizontal: 2,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rememberText: {
    fontSize: 13,
    color: '#55725e',
  },

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    flexShrink: 1,
  },

  loginButton: {
    backgroundColor: '#1e6b37',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1e6b37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  apiHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  neonRingContainer: {
    width: 110,
    height: 110,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  ringBase: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 5.8,
  },
  ringTrack: {
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  ringSpinner: {
    borderColor: 'transparent',
    borderTopColor: '#FFFFFF',
    borderRightColor: '#FFFFFF',
  },
  iconCenter: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  neonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
