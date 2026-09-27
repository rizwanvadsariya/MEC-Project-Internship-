/**
 * Comment thread on a scheme or site visit (phases.md Step 20) — RD, DG, MEO
 * only, support users are never routed to this screen (see RoleHomeScreen's
 * SUPPORT_USER exclusion and the fact CommentsScreen isn't even mounted in
 * SupportUserNavigator; the backend also rejects a SUPPORT_USER token here
 * with a 403 as a second layer).
 */
import { apiRequest, apiRequestWithMeta } from './client';

export type CommentableType = 'SCHEME' | 'SITE_VISIT';

export type Comment = {
	id: string;
	commentableType: CommentableType;
	commentableId: string;
	authorId: string;
	authorName: string;
	authorRole: string;
	body: string;
	createdAt: string;
	updatedAt: string;
};

export async function listComments(commentableType: CommentableType, commentableId: string, token: string, cursor?: string | null) {
	const params = new URLSearchParams({ commentableType, commentableId });
	if (cursor) params.set('cursor', cursor);
	const { data, meta } = await apiRequestWithMeta<Comment[]>(`/comments?${params.toString()}`, { token });
	return { items: data, nextCursor: (meta?.nextCursor as string | null) ?? null };
}

export function createComment(commentableType: CommentableType, commentableId: string, body: string, token: string) {
	return apiRequest<Comment>('/comments', { method: 'POST', body: { commentableType, commentableId, body }, token });
}

export function updateComment(id: string, body: string, token: string) {
	return apiRequest<Comment>(`/comments/${id}`, { method: 'PATCH', body: { body }, token });
}

export function deleteComment(id: string, token: string) {
	return apiRequest<void>(`/comments/${id}`, { method: 'DELETE', token });
}
