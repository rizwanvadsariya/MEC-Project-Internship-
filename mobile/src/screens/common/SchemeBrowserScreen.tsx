import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
	ActivityIndicator,
	FlatList,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { useAuth } from '../../auth/useAuth';
import {
	getSchemeFilterOptions,
	listSchemes,
	type Lookup,
	type Scheme,
	type SchemeFilterOptions,
	type SchemeFilters,
} from '../../api/schemes.api';
import { colors, radius, spacing, typography } from '../../theme';

type FilterKey = 'divisionId' | 'districtId' | 'departmentId' | 'subSectorId' | 'status';
type FilterOption = { label: string; value?: number | string };

const EMPTY_FILTERS: SchemeFilters = { limit: 20 };

export default function SchemeBrowserScreen() {
	const { accessToken } = useAuth();
	const navigation = useNavigation<{ navigate: (screen: string, params?: { schemeId: number }) => void }>();
	const [filters, setFilters] = useState<SchemeFilters>(EMPTY_FILTERS);
	const [options, setOptions] = useState<SchemeFilterOptions | null>(null);
	const [schemes, setSchemes] = useState<Scheme[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState('');

	const load = useCallback(async (nextFilters: SchemeFilters, append = false) => {
		if (!accessToken) return;
		if (append) setLoadingMore(true);
		else setLoading(true);
		setError('');
		try {
			const result = await listSchemes(nextFilters, accessToken);
			setSchemes((current) => (append ? [...current, ...result.schemes] : result.schemes));
			setNextCursor(result.nextCursor);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not load schemes.');
		} finally {
			setLoading(false);
			setLoadingMore(false);
		}
	}, [accessToken]);

	useEffect(() => {
		if (!accessToken) return;
		getSchemeFilterOptions(accessToken).then(setOptions).catch(() => setError('Could not load filter options.'));
	}, [accessToken]);

	useEffect(() => {
		const timer = setTimeout(() => load({ ...filters, search: search.trim() || undefined }), 350);
		return () => clearTimeout(timer);
	}, [filters, load, search]);

	const filterOptions = useMemo(() => buildFilterOptions(activeFilter, options), [activeFilter, options]);
	const activeLabel = activeFilter ? filterTitle(activeFilter) : '';

	const chooseFilter = (value?: number | string) => {
		if (!activeFilter) return;
		setFilters((current) => ({ ...current, [activeFilter]: value, cursor: undefined }));
		setActiveFilter(null);
	};

	const clearFilters = () => {
		setFilters(EMPTY_FILTERS);
		setSearch('');
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Scheme browser</Text>
				<Text style={styles.subtitle}>Read-only ADP scheme register</Text>
			</View>
			<TextInput
				value={search}
				onChangeText={setSearch}
				placeholder="Search scheme name or UID"
				placeholderTextColor={colors.textSecondary}
				style={styles.search}
				returnKeyType="search"
			/>
			<View style={styles.filterRow}>
				{(['divisionId', 'districtId', 'departmentId', 'subSectorId', 'status'] as FilterKey[]).map((key) => (
					<Pressable key={key} style={styles.filterChip} onPress={() => setActiveFilter(key)}>
						<Text style={styles.filterChipText}>{selectedLabel(key, filters[key], options)}</Text>
					</Pressable>
				))}
			</View>
			<Pressable onPress={clearFilters} style={styles.clearButton}>
				<Text style={styles.clearText}>Clear filters</Text>
			</Pressable>

			{error ? <Text style={styles.error}>{error}</Text> : null}
			{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !schemes.length ? <Text style={styles.empty}>No schemes match these filters.</Text> : null}
			<FlatList
				data={schemes}
				keyExtractor={(item) => String(item.id)}
				renderItem={({ item }) => <SchemeCard scheme={item} onAssemble={() => navigation.navigate('TeamAssembly', { schemeId: item.id })} />}
				contentContainerStyle={styles.list}
				onEndReached={() => nextCursor && !loadingMore && load({ ...filters, search: search.trim() || undefined, cursor: nextCursor }, true)}
				onEndReachedThreshold={0.4}
				ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
			/>

			<Modal visible={activeFilter !== null} transparent animationType="slide" onRequestClose={() => setActiveFilter(null)}>
				<Pressable style={styles.modalBackdrop} onPress={() => setActiveFilter(null)}>
					<Pressable style={styles.modalCard} onPress={() => {}}>
						<Text style={styles.modalTitle}>{activeLabel}</Text>
						<Pressable style={styles.option} onPress={() => chooseFilter(undefined)}>
							<Text style={styles.optionText}>All {activeLabel.toLowerCase()}</Text>
						</Pressable>
						<FlatList
							data={filterOptions}
							keyExtractor={(item) => `${item.label}-${String(item.value)}`}
							renderItem={({ item }) => (
								<Pressable style={styles.option} onPress={() => chooseFilter(item.value)}>
									<Text style={styles.optionText}>{item.label}</Text>
								</Pressable>
							)}
						/>
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	);
}

function SchemeCard({ scheme, onAssemble }: { scheme: Scheme; onAssemble: () => void }) {
	return (
		<View style={styles.card}>
			<View style={styles.cardTop}>
				<Text style={styles.uid}>{scheme.uid}</Text>
				<Text style={styles.status}>{scheme.status || 'Unspecified'}</Text>
			</View>
			<Text style={styles.schemeName}>{scheme.name}</Text>
			<Text style={styles.meta}>{scheme.departmentName}{scheme.subSectorName ? ` · ${scheme.subSectorName}` : ''}</Text>
			<Text style={styles.meta}>{scheme.districts.join(', ') || 'District not specified'}</Text>
			<View style={styles.progressRow}>
				<Text style={styles.progress}>Physical {scheme.physicalProgressPct ?? 0}%</Text>
				<Text style={styles.progress}>Financial {scheme.financialProgressPct ?? 0}%</Text>
			</View>
			<Pressable style={styles.teamButton} onPress={onAssemble}>
				<Text style={styles.teamButtonText}>Assemble team</Text>
			</Pressable>
		</View>
	);
}

function buildFilterOptions(key: FilterKey | null, options: SchemeFilterOptions | null): FilterOption[] {
	if (!key || !options) return [];
	if (key === 'status') return options.statuses.map((value) => ({ label: value, value }));
	const source: Lookup[] = key === 'divisionId' ? options.divisions : key === 'districtId' ? options.districts : key === 'departmentId' ? options.departments : options.subSectors;
	return source.map((item) => ({ label: item.name, value: item.id }));
}

function selectedLabel(key: FilterKey, value: number | string | undefined, options: SchemeFilterOptions | null) {
	if (value === undefined) return filterTitle(key);
	if (key === 'status') return String(value);
	const source = key === 'divisionId' ? options?.divisions : key === 'districtId' ? options?.districts : key === 'departmentId' ? options?.departments : options?.subSectors;
	return source?.find((item) => item.id === value)?.name ?? filterTitle(key);
}

function filterTitle(key: FilterKey) {
	return { divisionId: 'Division', districtId: 'District', departmentId: 'Department', subSectorId: 'Sub-sector', status: 'Status' }[key];
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
	header: { marginBottom: spacing.md },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs },
	search: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, color: colors.textPrimary, padding: spacing.md, fontSize: typography.size.md },
	filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
	filterChip: { backgroundColor: colors.primaryLight, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
	filterChipText: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
	clearButton: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
	clearText: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	list: { paddingBottom: spacing.xl },
	loader: { margin: spacing.xl },
	empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
	error: { color: colors.error, marginVertical: spacing.sm, lineHeight: typography.lineHeight.md },
	card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
	cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
	uid: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold, flex: 1 },
	status: { color: colors.success, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	schemeName: { color: colors.textPrimary, fontSize: typography.size.md, fontWeight: typography.weight.bold, lineHeight: typography.lineHeight.md, marginTop: spacing.sm },
	meta: { color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: typography.lineHeight.sm, marginTop: spacing.xs },
	progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
	progress: { color: colors.textPrimary, fontSize: typography.size.xs, fontWeight: typography.weight.medium },
	teamButton: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.md },
	teamButtonText: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(27,46,30,0.35)' },
	modalCard: { maxHeight: '75%', backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
	modalTitle: { color: colors.textPrimary, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginBottom: spacing.sm },
	option: { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: spacing.md },
	optionText: { color: colors.textPrimary, fontSize: typography.size.md },
});
