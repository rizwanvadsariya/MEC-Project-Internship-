/**
 * Discussion thread on a scheme or site visit (phases.md Step 20). RD, DG,
 * MEO only — this screen is never mounted in SupportUserNavigator, and even
 * if reached some other way the backend's own authorize(RD, DG, MEO)
 * allow-list rejects a SUPPORT_USER token with a 403.
 */
import React, { useCallback, useState } from 'react';
import {
	ActivityIndicator,
	FlatList,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import {
	createComment,
	deleteComment,
	listComments,
	updateComment,
	type Comment,
	type CommentableType,
} from '../../api/comments.api';
import { colors, radius, spacing, typography } from '../../theme';

type RouteParams = { commentableType: CommentableType; commentableId: string; title?: string };

export default function CommentsScreen() {
	const { t } = useTranslation();
	const { accessToken, user } = useAuth();
	const route = useRoute<{ key: string; name: string; params?: RouteParams }>();
	const { commentableType, commentableId, title } = route.params ?? { commentableType: 'SCHEME' as CommentableType, commentableId: '' };

	const [comments, setComments] = useState<Comment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [draft, setDraft] = useState('');
	const [posting, setPosting] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState('');

	const load = useCallback(async () => {
		if (!accessToken || !commentableId) return;
		setLoading(true);
		try {
			const result = await listComments(commentableType, commentableId, accessToken);
			setComments(result.items);
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('comments.couldNotLoad'));
		} finally {
			setLoading(false);
		}
	}, [accessToken, commentableType, commentableId, t]);

	useFocusEffect(
		useCallback(() => {
			const timer = setTimeout(() => { void load(); }, 0);
			return () => clearTimeout(timer);
		}, [load]),
	);

	const post = async () => {
		const body = draft.trim();
		if (!accessToken || !body) return;
		setPosting(true);
		try {
			const created = await createComment(commentableType, commentableId, body, accessToken);
			setComments((current) => [created, ...current]);
			setDraft('');
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('comments.couldNotPost'));
		} finally {
			setPosting(false);
		}
	};

	const startEdit = (comment: Comment) => {
		setEditingId(comment.id);
		setEditDraft(comment.body);
	};

	const saveEdit = async () => {
		const body = editDraft.trim();
		if (!accessToken || !editingId || !body) return;
		try {
			const updated = await updateComment(editingId, body, accessToken);
			setComments((current) => current.map((c) => (c.id === updated.id ? updated : c)));
			setEditingId(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : t('comments.couldNotSaveEdit'));
		}
	};

	const remove = async (id: string) => {
		if (!accessToken) return;
		try {
			await deleteComment(id, accessToken);
			setComments((current) => current.filter((c) => c.id !== id));
		} catch (err) {
			setError(err instanceof Error ? err.message : t('comments.couldNotDelete'));
		}
	};

	return (
		<KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
			<Text style={styles.title}>{title ?? t('comments.defaultTitle')}</Text>

			{error ? <Text style={styles.error}>{error}</Text> : null}
			{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !comments.length ? <Text style={styles.empty}>{t('comments.noCommentsYet')}</Text> : null}

			<FlatList
				data={comments}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.list}
				renderItem={({ item }) => (
					<CommentRow
						comment={item}
						isOwn={item.authorId === user?.id}
						isEditing={editingId === item.id}
						editDraft={editDraft}
						onChangeEditDraft={setEditDraft}
						onEdit={() => startEdit(item)}
						onCancelEdit={() => setEditingId(null)}
						onSaveEdit={saveEdit}
						onDelete={() => remove(item.id)}
					/>
				)}
			/>

			<View style={styles.composeRow}>
				<TextInput
					value={draft}
					onChangeText={setDraft}
					placeholder={t('comments.writeCommentPlaceholder')}
					placeholderTextColor={colors.textSecondary}
					style={styles.composeInput}
					multiline
				/>
				<Pressable style={[styles.postButton, (!draft.trim() || posting) && styles.postButtonDisabled]} onPress={post} disabled={!draft.trim() || posting}>
					{posting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.postButtonText}>{t('comments.post')}</Text>}
				</Pressable>
			</View>
		</KeyboardAvoidingView>
	);
}

function CommentRow({
	comment,
	isOwn,
	isEditing,
	editDraft,
	onChangeEditDraft,
	onEdit,
	onCancelEdit,
	onSaveEdit,
	onDelete,
}: {
	comment: Comment;
	isOwn: boolean;
	isEditing: boolean;
	editDraft: string;
	onChangeEditDraft: (value: string) => void;
	onEdit: () => void;
	onCancelEdit: () => void;
	onSaveEdit: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const ROLE_LABEL: Record<string, string> = {
		REGIONAL_DIRECTOR: t('comments.roleLabel.REGIONAL_DIRECTOR'),
		DIRECTOR_GENERAL: t('comments.roleLabel.DIRECTOR_GENERAL'),
		MEO: t('comments.roleLabel.MEO'),
		SUPPORT_USER: t('comments.roleLabel.SUPPORT_USER'),
	};
	return (
		<View style={styles.row}>
			<View style={styles.rowHeader}>
				<Text style={styles.author}>{comment.authorName} · {ROLE_LABEL[comment.authorRole] ?? comment.authorRole}</Text>
				<Text style={styles.timestamp}>{new Date(comment.createdAt).toLocaleString()}</Text>
			</View>

			{isEditing ? (
				<View>
					<TextInput value={editDraft} onChangeText={onChangeEditDraft} style={styles.editInput} multiline />
					<View style={styles.editActions}>
						<Pressable onPress={onCancelEdit}><Text style={styles.actionText}>{t('comments.cancel')}</Text></Pressable>
						<Pressable onPress={onSaveEdit}><Text style={styles.actionTextPrimary}>{t('comments.save')}</Text></Pressable>
					</View>
				</View>
			) : (
				<>
					<Text style={styles.body}>{comment.body}</Text>
					{isOwn ? (
						<View style={styles.editActions}>
							<Pressable onPress={onEdit}><Text style={styles.actionText}>{t('comments.edit')}</Text></Pressable>
							<Pressable onPress={onDelete}><Text style={styles.actionTextDanger}>{t('comments.delete')}</Text></Pressable>
						</View>
					) : null}
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
	title: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
	loader: { margin: spacing.xl },
	empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
	error: { color: colors.error, marginBottom: spacing.sm, lineHeight: typography.lineHeight.md },
	list: { paddingBottom: spacing.md },
	row: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
	rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
	author: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	timestamp: { color: colors.textSecondary, fontSize: typography.size.xs },
	body: { color: colors.textPrimary, fontSize: typography.size.sm, lineHeight: typography.lineHeight.md },
	editInput: { color: colors.textPrimary, fontSize: typography.size.sm, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, minHeight: 60, textAlignVertical: 'top' },
	editActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
	actionText: { color: colors.textSecondary, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
	actionTextPrimary: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	actionTextDanger: { color: colors.error, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
	composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingTop: spacing.sm, borderTopColor: colors.border, borderTopWidth: 1 },
	composeInput: { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, color: colors.textPrimary, padding: spacing.sm, maxHeight: 100 },
	postButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
	postButtonDisabled: { backgroundColor: colors.primaryLight },
	postButtonText: { color: colors.white, fontWeight: typography.weight.bold },
});
