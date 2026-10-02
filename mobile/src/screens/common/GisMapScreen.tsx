/**
 * GIS map view (phases.md Step 30 — "schemes by division/district,
 * color-coded by progress or issue severity"), depending on Step 7 (scheme
 * browsing) and Step 23 (analytics). Open to every authenticated role —
 * the division/district progress rollups it's built from are already
 * province-wide data (the same figures the scheme browser already exposes
 * to everyone), so this map doesn't grant anyone new access.
 *
 * Renders a real, pannable/zoomable OpenStreetMap via `react-native-webview`
 * + Leaflet.js (leafletMapHtml.ts builds the page), per the user's explicit
 * request for a proper interactive map rather than this step's original
 * dependency-free schematic canvas. Deliberately NOT `react-native-maps` —
 * on Android its MapView needs a Google Maps API key baked into the native
 * build even when only overlaying OSM tiles, which Expo Go's fixed binary
 * doesn't have; a WebView running plain HTML/Leaflet has no such
 * requirement and is officially Expo-Go-compatible. See leafletMapHtml.ts's
 * own header for the full reasoning.
 *
 * Zoom is bounded both ways, per the user's own request: `minZoom`
 * (sindhGeography.ts) plus a `maxBounds` locked to roughly the whole
 * province means the user can never zoom/pan out past "all of Sindh
 * visible," and `maxZoom` stops at roughly district-headquarters level —
 * this map's job is placing a district, not street-level navigation within
 * one.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '../../auth/useAuth';
import { getMapSummary, type MapDistrictSummary, type MapDistrictIssues, type MapSummary } from '../../api/map.api';
import { getDistrictCoordinates } from '../../map/sindhGeography';
import { buildLeafletMapHtml, parseMapMessage, type MapMarker } from '../../map/leafletMapHtml';
import { colorForProgress, colorForSeverity } from '../../map/mapColors';
import { colors, radius, spacing, typography } from '../../theme';

type ColorMode = 'progress' | 'severity';
const HIGH_VALUE_ROLES = ['REGIONAL_DIRECTOR', 'DIRECTOR_GENERAL'];

export default function GisMapScreen() {
	const { t } = useTranslation();
	const { accessToken, user } = useAuth();
	const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, number>) => void }>();
	const canSeeSeverity = user?.role != null && HIGH_VALUE_ROLES.includes(user.role);

	const [summary, setSummary] = useState<MapSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [mode, setMode] = useState<ColorMode>('progress');
	const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null);

	const load = useCallback(async () => {
		if (!accessToken) return;
		setLoading(true);
		try {
			setSummary(await getMapSummary(accessToken));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('gisMap.couldNotLoad'));
		} finally {
			setLoading(false);
		}
	}, [accessToken, t]);

	useFocusEffect(
		useCallback(() => {
			const timer = setTimeout(() => { void load(); }, 0);
			return () => clearTimeout(timer);
		}, [load]),
	);

	const issuesByDistrictId = useMemo(
		() => new Map((summary?.issuesByDistrict ?? []).map((row) => [row.districtId, row])),
		[summary],
	);
	const selectedDistrict = summary?.districts.find((d) => d.districtId === selectedDistrictId) ?? null;
	const selectedIssues = selectedDistrictId != null ? issuesByDistrictId.get(selectedDistrictId) : undefined;

	const mapHtml = useMemo(() => {
		const markers: MapMarker[] = (summary?.districts ?? [])
			.map((district): MapMarker | null => {
				const coords = getDistrictCoordinates(district.districtName);
				if (!coords) return null;
				const color = mode === 'progress'
					? colorForProgress(district.avgPhysicalProgressPct)
					: colorForSeverity(issuesByDistrictId.get(district.districtId) ?? null);
				return { districtId: district.districtId, districtName: district.districtName, lat: coords.lat, lng: coords.lng, color };
			})
			.filter((marker): marker is MapMarker => marker !== null);
		return buildLeafletMapHtml(markers);
	}, [summary, mode, issuesByDistrictId]);

	const handleMessage = useCallback((event: WebViewMessageEvent) => {
		const message = parseMapMessage(event.nativeEvent.data);
		if (message) setSelectedDistrictId(message.districtId);
	}, []);

	if (loading && !summary) {
		return (
			<View style={styles.centered}>
				<ActivityIndicator color={colors.primary} />
			</View>
		);
	}

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>{t('gisMap.title')}</Text>
				<Text style={styles.subtitle}>{t('gisMap.subtitle')}</Text>
				<Text style={styles.disclaimer}>{t('gisMap.pinAccuracyDisclaimer')}</Text>

				{error ? <Text style={styles.error}>{error}</Text> : null}

				{canSeeSeverity ? (
					<View style={styles.modeRow}>
						<Pressable
							style={[styles.modeChip, mode === 'progress' && styles.modeChipActive]}
							onPress={() => setMode('progress')}
						>
							<Text style={[styles.modeChipText, mode === 'progress' && styles.modeChipTextActive]}>{t('gisMap.modeProgress')}</Text>
						</Pressable>
						<Pressable
							style={[styles.modeChip, mode === 'severity' && styles.modeChipActive]}
							onPress={() => setMode('severity')}
						>
							<Text style={[styles.modeChipText, mode === 'severity' && styles.modeChipTextActive]}>{t('gisMap.modeSeverity')}</Text>
						</Pressable>
					</View>
				) : null}

				<Legend mode={mode} t={t} />
			</View>

			<WebView
				key={mode}
				originWhitelist={['*']}
				source={{ html: mapHtml }}
				onMessage={handleMessage}
				style={styles.webview}
				startInLoadingState
				renderLoading={() => (
					<View style={styles.webviewLoading}>
						<ActivityIndicator color={colors.primary} />
					</View>
				)}
			/>

			<Modal visible={selectedDistrict !== null} transparent animationType="slide" onRequestClose={() => setSelectedDistrictId(null)}>
				<Pressable style={styles.modalBackdrop} onPress={() => setSelectedDistrictId(null)}>
					<Pressable style={styles.modalCard} onPress={() => {}}>
						{selectedDistrict ? (
							<DistrictDetail
								district={selectedDistrict}
								issues={selectedIssues}
								canSeeSeverity={canSeeSeverity}
								t={t}
								onViewSchemes={() => {
									setSelectedDistrictId(null);
									navigation.navigate('Schemes', { districtId: selectedDistrict.districtId });
								}}
							/>
						) : null}
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	);
}

function Legend({ mode, t }: { mode: ColorMode; t: TFunction }) {
	const items = mode === 'progress'
		? [
			{ color: colors.success, label: t('gisMap.legend.progressHigh') },
			{ color: colors.warning, label: t('gisMap.legend.progressMedium') },
			{ color: colors.error, label: t('gisMap.legend.progressLow') },
			{ color: colors.border, label: t('gisMap.legend.noData') },
		]
		: [
			{ color: colors.success, label: t('gisMap.legend.severityNone') },
			{ color: colors.warning, label: t('gisMap.legend.severityModerate') },
			{ color: colors.error, label: t('gisMap.legend.severityHigh') },
		];
	return (
		<View style={styles.legend}>
			{items.map((item) => (
				<View key={item.label} style={styles.legendItem}>
					<View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
					<Text style={styles.legendText}>{item.label}</Text>
				</View>
			))}
		</View>
	);
}

function DistrictDetail({
	district,
	issues,
	canSeeSeverity,
	t,
	onViewSchemes,
}: {
	district: MapDistrictSummary;
	issues: MapDistrictIssues | undefined;
	canSeeSeverity: boolean;
	t: TFunction;
	onViewSchemes: () => void;
}) {
	return (
		<View>
			<Text style={styles.modalTitle}>{district.districtName}</Text>
			<Text style={styles.modalLine}>
				{t('gisMap.schemesReportedContext', { reported: district.schemesReported, total: district.schemesTotal })}
			</Text>
			<Text style={styles.modalLine}>
				{district.avgPhysicalProgressPct === null
					? t('gisMap.notYetReported')
					: t('gisMap.avgProgress', { pct: Math.round(district.avgPhysicalProgressPct) })}
			</Text>
			{canSeeSeverity && issues ? (
				<Text style={styles.modalLine}>
					{t('gisMap.openIssuesContext', { count: issues.openIssues, critical: issues.critical, high: issues.high })}
				</Text>
			) : null}
			<Pressable style={styles.viewSchemesButton} onPress={onViewSchemes}>
				<Text style={styles.viewSchemesButtonText}>{t('gisMap.viewSchemesInDistrict')}</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
	header: { padding: spacing.lg, paddingBottom: spacing.sm },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs },
	disclaimer: { color: colors.textSecondary, fontSize: typography.size.xs, fontStyle: 'italic', marginTop: spacing.xs, marginBottom: spacing.sm },
	error: { color: colors.error, lineHeight: typography.lineHeight.md, marginBottom: spacing.sm },
	modeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
	modeChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
	modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
	modeChipText: { color: colors.textSecondary, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
	modeChipTextActive: { color: colors.white },
	legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
	legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
	legendSwatch: { width: 12, height: 12, borderRadius: radius.pill },
	legendText: { color: colors.textSecondary, fontSize: typography.size.xs },
	webview: { flex: 1 },
	// StyleSheet.absoluteFillObject doesn't exist in this RN version's TS
	// types (Memory.md's established workaround, see LoginScreen/QrScanScreen).
	webviewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
	modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(27,46,30,0.35)' },
	modalCard: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
	modalTitle: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
	modalLine: { color: colors.textSecondary, fontSize: typography.size.sm, marginBottom: spacing.xs },
	viewSchemesButton: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.md },
	viewSchemesButtonText: { color: colors.white, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
});
