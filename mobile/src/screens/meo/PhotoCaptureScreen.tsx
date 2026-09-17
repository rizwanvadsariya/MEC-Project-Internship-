/** Capture/compress/upload progress photos; GPS geo-tag (Phase 2). */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../../auth/useAuth';
import { deleteVisitPhoto, listVisitPhotos, uploadVisitPhoto, type VisitPhoto } from '../../api/photos.api';
import { colors, radius, spacing, typography } from '../../theme';

export default function PhotoCaptureScreen() {
	const { accessToken } = useAuth();
	const route = useRoute<{ key: string; name: string; params?: { id?: string } }>();
	const visitId = route.params?.id ?? '';
	const [photos, setPhotos] = useState<VisitPhoto[]>([]);
	const [pendingPhotos, setPendingPhotos] = useState<{ id: string; uri: string; caption: string }[]>([]);
	const [caption, setCaption] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<{ uri: string; caption?: string } | null>(null);

	const load = useCallback(async () => {
		if (!accessToken || !visitId) return;
		try { setPhotos(await listVisitPhotos(visitId, accessToken)); setError(''); }
		catch (err) { setError(err instanceof Error ? err.message : 'Could not load photos.'); }
		finally { setLoading(false); }
	}, [accessToken, visitId]);

	useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

	const capture = async () => {
		if (!accessToken) return;
		const permission = await ImagePicker.requestCameraPermissionsAsync();
		if (!permission.granted) { setError('Camera permission is required to capture a visit photo.'); return; }
		const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
		if (result.canceled || !result.assets[0]) return;
		setError('');
		setPendingPhotos((current) => [...current, {
			id: `${Date.now()}-${current.length}`,
			uri: result.assets[0].uri,
			caption: caption.trim(),
		}]);
		setCaption('');
	};

	const submitPhotos = async () => {
		if (!accessToken || !pendingPhotos.length) return;
		setBusy(true); setError('');
		try {
			const uploaded: VisitPhoto[] = [];
			for (const photo of pendingPhotos) {
				uploaded.push(await uploadVisitPhoto(visitId, accessToken, photo.uri, photo.caption || undefined));
			}
			setPhotos((current) => [...uploaded.reverse(), ...current]);
			setPendingPhotos([]);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not submit the photos.');
		} finally { setBusy(false); }
	};

	const removePendingPhoto = (photoId: string) => {
		setPendingPhotos((current) => current.filter((photo) => photo.id !== photoId));
	};

	const removeSubmittedPhoto = async (photoId: string) => {
		if (!accessToken) return;
		setBusy(true); setError('');
		try {
			await deleteVisitPhoto(visitId, photoId, accessToken);
			setPhotos((current) => current.filter((photo) => photo.id !== photoId));
			if (preview) setPreview(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not remove the photo.');
		} finally { setBusy(false); }
	};

	return <ScrollView contentContainerStyle={styles.container}>
		<Text style={styles.title}>Progress photos</Text>
		<Text style={styles.subtitle}>Capture evidence from the current site visit.</Text>
		<View style={styles.guidance}>
			<Text style={styles.guidanceTitle}>Field capture guidelines</Text>
			<Text style={styles.guidanceText}>• Capture the full site first, then key work details.</Text>
			<Text style={styles.guidanceText}>• Keep the work area, materials, and surroundings visible.</Text>
			<Text style={styles.guidanceText}>• Use daylight where possible and hold the phone steady.</Text>
			<Text style={styles.guidanceText}>• Avoid faces, personal documents, and unrelated people.</Text>
			<Text style={styles.guidanceText}>• Take before/after or progress-stage photos from a safe position.</Text>
			<Text style={styles.guidanceText}>• Add a caption describing the location or work shown.</Text>
		</View>
		<TextInput value={caption} onChangeText={setCaption} placeholder="Optional caption" placeholderTextColor={colors.textSecondary} style={styles.input} />
		<Pressable disabled={busy} style={styles.button} onPress={() => { void capture(); }}><Text style={styles.buttonText}>Capture photo</Text></Pressable>
		{pendingPhotos.length ? <View style={styles.reviewSection}>
			<Text style={styles.sectionTitle}>Ready to submit ({pendingPhotos.length})</Text>
			<View style={styles.grid}>{pendingPhotos.map((photo) => <View key={photo.id} style={styles.photoCard}><Pressable onPress={() => setPreview({ uri: photo.uri, caption: photo.caption })}><Image source={{ uri: photo.uri }} style={styles.photo} /><Text style={styles.caption}>{photo.caption || 'Tap to preview'}</Text></Pressable><Pressable accessibilityLabel="Remove pending photo" hitSlop={8} style={styles.removeButton} onPress={() => removePendingPhoto(photo.id)}><Ionicons name="close" size={18} color={colors.white} /></Pressable></View>)}</View>
			<Pressable disabled={busy} style={styles.submitButton} onPress={() => { void submitPhotos(); }}><Text style={styles.buttonText}>{busy ? 'Submitting...' : 'Submit photos'}</Text></Pressable>
		</View> : null}
		{error ? <Text style={styles.error}>{error}</Text> : null}
		{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
		{photos.length ? <Text style={styles.sectionTitle}>Submitted photos</Text> : null}
		<View style={styles.grid}>{photos.map((photo) => <View key={photo.id} style={styles.photoCard}><Pressable onPress={() => setPreview({ uri: photo.signedUrl, caption: photo.caption || undefined })}><Image source={{ uri: photo.signedUrl }} style={styles.photo} /><Text style={styles.caption}>{photo.caption || 'Tap to preview'}</Text></Pressable><Pressable accessibilityLabel="Remove submitted photo" hitSlop={8} style={styles.removeButton} onPress={() => { void removeSubmittedPhoto(photo.id); }}><Ionicons name="close" size={18} color={colors.white} /></Pressable></View>)}</View>
		<Modal visible={preview !== null} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
			<Pressable style={styles.previewBackdrop} onPress={() => setPreview(null)}>
				{preview ? <View style={styles.previewContent}><Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" /><Text style={styles.previewCaption}>{preview.caption || 'Photo preview'}</Text><Text style={styles.closeText}>Tap outside to close</Text></View> : null}
			</Pressable>
		</Modal>
	</ScrollView>;
}

const styles = StyleSheet.create({
	container: { flexGrow: 1, backgroundColor: colors.background, padding: spacing.lg },
	title: { color: colors.textPrimary, fontSize: typography.size.xl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg },
	guidance: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
	guidanceTitle: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginBottom: spacing.xs },
	guidanceText: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.md },
	input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.textPrimary, minHeight: 48, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
	button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md },
	submitButton: { alignItems: 'center', backgroundColor: colors.primaryDark, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
	buttonText: { color: colors.white, fontWeight: typography.weight.bold },
	error: { color: colors.error, lineHeight: typography.lineHeight.md, marginTop: spacing.sm },
	loader: { margin: spacing.lg },
	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
	reviewSection: { marginTop: spacing.md },
	sectionTitle: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, marginTop: spacing.lg },
	photoCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', width: '48%' },
	removeButton: { alignItems: 'center', justifyContent: 'center', position: 'absolute', right: spacing.xs, top: spacing.xs, width: 30, height: 30, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.72)' },
	photo: { aspectRatio: 1, width: '100%' },
	caption: { color: colors.textSecondary, fontSize: typography.size.xs, padding: spacing.sm },
	previewBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.88)', padding: spacing.lg },
	previewContent: { alignItems: 'center', width: '100%' },
	previewImage: { width: '100%', height: '75%' },
	previewCaption: { color: colors.white, fontSize: typography.size.md, marginTop: spacing.md },
	closeText: { color: '#D0D0D0', fontSize: typography.size.xs, marginTop: spacing.sm },
});
