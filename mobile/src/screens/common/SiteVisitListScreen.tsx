/**
 * Site visits the signed-in user can see — RD/DG get every visit in their
 * division, MEO/Support get only visits for teams they're a member of (the
 * same scoping the backend enforces in siteVisit.repo/RLS). Shared across all
 * 4 role navigators rather than duplicated per role.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { listSiteVisits, type SiteVisitSummary } from '../../api/siteVisits.api';
import { colors, radius, spacing, typography } from '../../theme';

function statusColor(status: string) {
	if (status === 'IN_PROGRESS') return colors.warning;
	if (status === 'COMPLETED') return colors.success;
	if (status === 'CANCELLED') return colors.textSecondary;
	return colors.primary;
}

export default function SiteVisitListScreen() {
	const { t } = useTranslation();
	const { accessToken } = useAuth();
	const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void }>();
	const [items, setItems] = useState<SiteVisitSummary[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken) return;
		setLoading(true);
		try {
			const result = await listSiteVisits(accessToken);
			setItems(result.items);
			setNextCursor(result.nextCursor);
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('siteVisits.list.couldNotLoad'));
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

	const loadMore = async () => {
		if (!accessToken || !nextCursor || loadingMore) return;
		setLoadingMore(true);
		try {
			const result = await listSiteVisits(accessToken, { cursor: nextCursor });
			setItems((prev) => [...prev, ...result.items]);
			setNextCursor(result.nextCursor);
		} catch (err) {
			setError(err instanceof Error ? err.message : t('siteVisits.list.couldNotLoadMore'));
		} finally {
			setLoadingMore(false);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>{t('siteVisits.list.title')}</Text>
				<Text style={styles.subtitle}>{t('siteVisits.list.subtitle')}</Text>
			</View>
			{error ? <Text style={styles.error}>{error}</Text> : null}
			{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !items.length ? <Text style={styles.empty}>{t('siteVisits.list.noVisitsYet')}</Text> : null}
			<FlatList
				data={items}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.list}
				onEndReachedThreshold={0.4}
				onEndReached={loadMore}
				ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
				renderItem={({ item }) => (
					<Pressable style={styles.card} onPress={() => navigation.navigate('SiteVisitDetail', { id: item.id })}>
						<View style={styles.cardHeader}>
							<Text style={styles.uid}>{item.schemeUid}</Text>
							<View style={[styles.statusPill, { backgroundColor: statusColor(item.status) }]}>
								<Text style={styles.statusText}>{t(`siteVisits.status.${item.status}`, { defaultValue: item.status })}</Text>
							</View>
						</View>
						<Text style={styles.schemeName}>{item.schemeName}</Text>
						<Text style={styles.meta}>
							{item.scheduledDate ? t('siteVisits.list.scheduledOn', { date: item.scheduledDate }) : t('siteVisits.list.notYetScheduled')}
						</Text>
					</Pressable>
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
	header: { marginBottom: spacing.md },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginTop: spacing.sm },
	error: { color: colors.error, lineHeight: typography.lineHeight.md, marginBottom: spacing.sm },
	loader: { margin: spacing.xl },
	empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
	list: { paddingBottom: spacing.xl },
	card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
	cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
	uid: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	statusPill: { borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
	statusText: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	schemeName: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.md, marginTop: spacing.xs },
	meta: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.sm, marginTop: spacing.xs },
});
