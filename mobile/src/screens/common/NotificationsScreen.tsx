/**
 * In-app notification list — the other half of phases.md Step 17 alongside
 * push delivery, and the part that works regardless of push infra (EAS
 * projectId, dev build, permission state). Refetches on every focus, same
 * pattern as SiteVisitListScreen, since a notification can arrive while this
 * screen is backgrounded.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../auth/useAuth';
import { listNotifications, markNotificationRead, type NotificationItem } from '../../api/notifications.api';
import { colors, radius, spacing, typography } from '../../theme';

export default function NotificationsScreen() {
	const { accessToken } = useAuth();
	const [items, setItems] = useState<NotificationItem[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async () => {
		if (!accessToken) return;
		setLoading(true);
		try {
			const result = await listNotifications(accessToken);
			setItems(result.items);
			setNextCursor(result.nextCursor);
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not load notifications.');
		} finally {
			setLoading(false);
		}
	}, [accessToken]);

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
			const result = await listNotifications(accessToken, { cursor: nextCursor });
			setItems((prev) => [...prev, ...result.items]);
			setNextCursor(result.nextCursor);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not load more notifications.');
		} finally {
			setLoadingMore(false);
		}
	};

	const onPressItem = async (item: NotificationItem) => {
		if (item.isRead || !accessToken) return;
		setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
		try {
			await markNotificationRead(item.id, accessToken);
		} catch {
			// Non-critical — worst case the item shows read locally until the next refetch.
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Notifications</Text>
				<Text style={styles.subtitle}>Team decisions, completed visits, and issues filed on your visits.</Text>
			</View>
			{error ? <Text style={styles.error}>{error}</Text> : null}
			{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !items.length ? <Text style={styles.empty}>No notifications yet.</Text> : null}
			<FlatList
				data={items}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.list}
				onEndReachedThreshold={0.4}
				onEndReached={loadMore}
				ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
				renderItem={({ item }) => (
					<Pressable style={[styles.card, !item.isRead && styles.cardUnread]} onPress={() => onPressItem(item)}>
						<View style={styles.cardHeader}>
							<Text style={styles.cardTitle}>{item.title}</Text>
							{!item.isRead ? <View style={styles.unreadDot} /> : null}
						</View>
						{item.body ? <Text style={styles.cardBody}>{item.body}</Text> : null}
						<Text style={styles.cardMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
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
	cardUnread: { borderColor: colors.primary },
	cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
	cardTitle: { flex: 1, color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.md },
	unreadDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.primary, marginLeft: spacing.sm, marginTop: 4 },
	cardBody: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md, marginTop: spacing.xs },
	cardMeta: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: spacing.sm },
});
