/**
 * QR scan-to-open (phases.md Step 28) — scans a scheme's printed ADP QR code
 * and opens its record. Confirmed from a real printed booklet page
 * (user-reported, 2026-09-30): the QR payload is a government portal URL
 * with the scheme's `uid` as a query parameter (e.g.
 * "https://bbms.sferp.gos.pk/public/scheme?uid=AZUAQ-PP-19-0015"), not the
 * bare uid originally guessed at before any real booklet was available to
 * check against. All of the actual parsing lives in
 * src/utils/qrScheme.ts#normalizeScannedSchemeCode — this screen only ever
 * hands it the raw scanned text.
 *
 * Real device bug found and fixed (user-reported, 2026-09-30): scanning one
 * scheme's code consistently opened a different, physically nearby scheme
 * (off by 1-2 rows on the printed page, either direction). Root cause: real
 * ADP booklet pages pack several QR codes very close together, and
 * expo-camera's barcode scanner reads the entire camera frame, not just the
 * on-screen guide box drawn below — that box was purely decorative. At a
 * typical holding distance, more than one code enters the frame and the
 * scanner locks onto whichever one it decodes first, which is often a
 * neighbor, not the one the user is actually aiming at. expo-camera (SDK 57)
 * has no region-of-interest API to restrict scanning to the drawn box, and
 * `BarcodeScanningResult.bounds`/`cornerPoints` are explicitly documented as
 * inconsistent across platforms — not reliable enough to hit-test against
 * the guide box in JS. Mitigated with camera zoom (narrows the field of view
 * so far fewer codes fit in frame at once) plus a manual +/- zoom control,
 * since booklet pages and comfortable holding distance vary — this narrows
 * the problem a fixed zoom level alone can't fully eliminate.
 *
 * expo-camera (not the deprecated expo-barcode-scanner) — an official Expo
 * SDK package already bundled into Expo Go, same footing as expo-location/
 * expo-image-picker elsewhere in this app.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { clampZoom, ZOOM_STEP, DEFAULT_ZOOM } from '../../utils/qrScan';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { getSchemeByUid } from '../../api/schemes.api';
import { ApiClientError } from '../../api/client';
import { normalizeScannedSchemeCode } from '../../utils/qrScheme';
import { colors, radius, spacing, typography } from '../../theme';

export default function QrScanScreen() {
	const { t } = useTranslation();
	const { accessToken } = useAuth();
	const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, string | number>) => void }>();
	const [permission, requestPermission] = useCameraPermissions();
	const [lookingUp, setLookingUp] = useState(false);
	const [error, setError] = useState('');
	const [zoom, setZoom] = useState(DEFAULT_ZOOM);
	// A ref, not state — onBarcodeScanned fires repeatedly per frame while the
	// code stays in view; this must block re-entrancy synchronously, not wait
	// for a re-render, or the same code triggers several concurrent lookups.
	const handledRef = useRef(false);

	useFocusEffect(
		useCallback(() => {
			handledRef.current = false;
			setError('');
		}, []),
	);

	const onBarcodeScanned = async (result: BarcodeScanningResult) => {
		if (handledRef.current || !accessToken) return;
		const uid = normalizeScannedSchemeCode(result.data);
		if (!uid) return; // an empty/whitespace-only scan is never a real code — keep scanning silently
		handledRef.current = true;
		setLookingUp(true);
		setError('');
		try {
			const scheme = await getSchemeByUid(uid, accessToken);
			navigation.navigate('SchemeDetail', { schemeId: scheme.id });
		} catch (err) {
			if (err instanceof ApiClientError && err.status === 404) {
				setError(t('qrScan.schemeNotFound', { code: uid }));
			} else {
				setError(err instanceof Error ? err.message : t('qrScan.couldNotLookUp'));
			}
			setLookingUp(false);
			// handledRef stays true until the user explicitly retries — otherwise
			// the same still-in-view code would immediately re-trigger the same failure.
		}
	};

	const scanAgain = () => {
		handledRef.current = false;
		setError('');
	};

	const zoomIn = () => setZoom((current) => clampZoom(current + ZOOM_STEP));
	const zoomOut = () => setZoom((current) => clampZoom(current - ZOOM_STEP));

	if (!permission) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}

	if (!permission.granted) {
		return (
			<View style={styles.centered}>
				<Text style={styles.permissionTitle}>{t('qrScan.permissionTitle')}</Text>
				<Text style={styles.permissionBody}>{t('qrScan.permissionBody')}</Text>
				<Pressable style={styles.permissionButton} onPress={requestPermission}>
					<Text style={styles.permissionButtonText}>{t('qrScan.grantPermission')}</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<CameraView
				style={StyleSheet.absoluteFill}
				facing="back"
				zoom={zoom}
				barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
				onBarcodeScanned={onBarcodeScanned}
			/>
			<View style={styles.overlay} pointerEvents="none">
				<View style={styles.frame} />
			</View>

			<View style={styles.zoomControls}>
				<Pressable style={styles.zoomButton} onPress={zoomOut} accessibilityLabel={t('qrScan.zoomOut')}>
					<Text style={styles.zoomButtonText}>−</Text>
				</Pressable>
				<Text style={styles.zoomLevel}>{Math.round(zoom * 100)}%</Text>
				<Pressable style={styles.zoomButton} onPress={zoomIn} accessibilityLabel={t('qrScan.zoomIn')}>
					<Text style={styles.zoomButtonText}>+</Text>
				</Pressable>
			</View>

			<Text style={styles.hint}>{t('qrScan.hint')}</Text>

			{lookingUp ? (
				<View style={styles.statusBanner}>
					<ActivityIndicator color={colors.white} />
					<Text style={styles.statusText}>{t('qrScan.lookingUp')}</Text>
				</View>
			) : null}

			{error ? (
				<View style={styles.errorBanner}>
					<Text style={styles.errorText}>{error}</Text>
					<Pressable style={styles.retryButton} onPress={scanAgain}>
						<Text style={styles.retryButtonText}>{t('qrScan.scanAgain')}</Text>
					</Pressable>
				</View>
			) : null}
		</View>
	);
}

const FRAME_SIZE = 180;

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#000' },
	centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg },
	permissionTitle: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, textAlign: 'center' },
	permissionBody: { color: colors.textSecondary, fontSize: typography.size.sm, textAlign: 'center', marginTop: spacing.sm, lineHeight: typography.lineHeight.md },
	permissionButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.lg },
	permissionButtonText: { color: colors.white, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
	overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
	frame: { width: FRAME_SIZE, height: FRAME_SIZE, borderRadius: radius.md, borderWidth: 3, borderColor: colors.white },
	zoomControls: {
		position: 'absolute',
		bottom: spacing.xl * 2.5,
		left: 0,
		right: 0,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: spacing.md,
	},
	zoomButton: {
		width: 40,
		height: 40,
		borderRadius: radius.pill,
		backgroundColor: 'rgba(255,255,255,0.25)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	zoomButtonText: { color: colors.white, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
	zoomLevel: { color: colors.white, fontSize: typography.size.sm, fontWeight: typography.weight.medium, minWidth: 44, textAlign: 'center' },
	hint: {
		position: 'absolute',
		bottom: spacing.xl,
		left: spacing.lg,
		right: spacing.lg,
		color: colors.white,
		textAlign: 'center',
		fontSize: typography.size.sm,
	},
	statusBanner: {
		position: 'absolute',
		top: spacing.xl,
		left: spacing.lg,
		right: spacing.lg,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: spacing.sm,
		backgroundColor: 'rgba(0,0,0,0.6)',
		borderRadius: radius.md,
		padding: spacing.md,
	},
	statusText: { color: colors.white, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
	errorBanner: {
		position: 'absolute',
		top: spacing.xl,
		left: spacing.lg,
		right: spacing.lg,
		backgroundColor: colors.error,
		borderRadius: radius.md,
		padding: spacing.md,
	},
	errorText: { color: colors.white, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md },
	retryButton: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginTop: spacing.sm },
	retryButtonText: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
});
