import { apiRequest, apiRequestWithMeta } from './client';

export type NotificationItem = {
	id: string;
	title: string;
	body: string | null;
	relatedType: string | null;
	relatedId: string | null;
	isRead: boolean;
	createdAt: string;
};

export async function listNotifications(token: string, opts: { cursor?: string | null; unreadOnly?: boolean } = {}) {
	const params = new URLSearchParams();
	if (opts.cursor) params.set('cursor', opts.cursor);
	if (opts.unreadOnly) params.set('unreadOnly', 'true');
	const query = params.toString() ? `?${params.toString()}` : '';
	const { data, meta } = await apiRequestWithMeta<NotificationItem[]>(`/notifications${query}`, { token });
	return { items: data, nextCursor: (meta?.nextCursor as string | null) ?? null };
}

export function markNotificationRead(id: string, token: string) {
	return apiRequest<NotificationItem>(`/notifications/${id}/read`, { method: 'PATCH', token });
}

export function registerPushToken(token: string, expoPushToken: string, platform: 'ios' | 'android') {
	return apiRequest<{ id: string; token: string; platform: string }>('/notifications/push-tokens', {
		method: 'POST',
		token,
		body: { token: expoPushToken, platform },
	});
}

export function removePushToken(token: string, expoPushToken: string) {
	return apiRequest<void>('/notifications/push-tokens', {
		method: 'DELETE',
		token,
		body: { token: expoPushToken },
	});
}
