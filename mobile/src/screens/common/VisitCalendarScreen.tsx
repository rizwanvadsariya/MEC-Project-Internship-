/**
 * Visit scheduling calendar (phases.md Step 21) — RD and lead MEO plan
 * upcoming visits. Only mounted in RegionalDirectorNavigator and MeoNavigator
 * (DG/Support get no entry point here, matching the step's own "RD / lead
 * MEO" wording — same scoping approach as CommentsScreen for Step 20).
 *
 * The backend's own visibility scoping (RD: division, MEO: team membership)
 * already limits what listSiteVisits returns — this screen never needs its
 * own division/membership filter on top of that.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { listSiteVisits, scheduleSiteVisit, type SiteVisitSummary } from '../../api/siteVisits.api';
import { colors, radius, spacing, typography } from '../../theme';

const WINDOW_DAYS = 60;

type Section = { title: string; data: SiteVisitSummary[] };

export default function VisitCalendarScreen() {
	const { t } = useTranslation();
	const NEEDS_DATE_SECTION = t('calendar.needsDateSection');
	const { accessToken, user } = useAuth();
	const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, string>) => void }>();
	const [sections, setSections] = useState<Section[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [pickerForVisitId, setPickerForVisitId] = useState<string | null>(null);
	const [savingId, setSavingId] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!accessToken) return;
		setLoading(true);
		try {
			const today = toIsoDate(new Date());
			const horizon = toIsoDate(addDays(new Date(), WINDOW_DAYS));
			const [unscheduled, scheduled] = await Promise.all([
				listSiteVisits(accessToken, { status: 'SCHEDULED', unscheduled: true }),
				listSiteVisits(accessToken, { scheduledFrom: today, scheduledTo: horizon }),
			]);
			setSections(buildSections(unscheduled.items, scheduled.items, NEEDS_DATE_SECTION));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : t('calendar.couldNotLoad'));
		} finally {
			setLoading(false);
		}
	}, [accessToken, NEEDS_DATE_SECTION, t]);

	useFocusEffect(
		useCallback(() => {
			const timer = setTimeout(() => { void load(); }, 0);
			return () => clearTimeout(timer);
		}, [load]),
	);

	const canPlan = (visit: SiteVisitSummary) => user?.role === 'REGIONAL_DIRECTOR' || !!visit.isLeadMeo;

	const saveScheduledDate = async (visitId: string, scheduledDate: string) => {
		if (!accessToken) return;
		setSavingId(visitId);
		setPickerForVisitId(null);
		try {
			await scheduleSiteVisit(visitId, scheduledDate, accessToken);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : t('calendar.couldNotSaveDate'));
		} finally {
			setSavingId(null);
		}
	};

	return (
		<View style={styles.container}>
			<Text style={styles.title}>{t('calendar.title')}</Text>
			<Text style={styles.subtitle}>{t('calendar.subtitle', { days: WINDOW_DAYS })}</Text>

			{error ? <Text style={styles.error}>{error}</Text> : null}
			{loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
			{!loading && !sections.length ? <Text style={styles.empty}>{t('calendar.noApprovedVisits')}</Text> : null}

			<SectionList
				sections={sections}
				keyExtractor={(item) => item.id}
				contentContainerStyle={styles.list}
				renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
				renderItem={({ item, section }) => (
					<VisitRow
						visit={item}
						needsDate={section.title === NEEDS_DATE_SECTION}
						canPlan={canPlan(item)}
						saving={savingId === item.id}
						pickerOpen={pickerForVisitId === item.id}
						onOpenPicker={() => setPickerForVisitId(item.id)}
						onPickDate={(date) => saveScheduledDate(item.id, date)}
						onCancelPicker={() => setPickerForVisitId(null)}
						onPress={() => navigation.navigate('SiteVisitDetail', { id: item.id })}
					/>
				)}
			/>
		</View>
	);
}

function VisitRow({
	visit,
	needsDate,
	canPlan,
	saving,
	pickerOpen,
	onOpenPicker,
	onPickDate,
	onCancelPicker,
	onPress,
}: {
	visit: SiteVisitSummary;
	needsDate: boolean;
	canPlan: boolean;
	saving: boolean;
	pickerOpen: boolean;
	onOpenPicker: () => void;
	onPickDate: (date: string) => void;
	onCancelPicker: () => void;
	onPress: () => void;
}) {
	const { t } = useTranslation();
	return (
		<Pressable style={styles.row} onPress={onPress}>
			<View style={styles.rowText}>
				<Text style={styles.uid}>{visit.schemeUid}</Text>
				<Text style={styles.schemeName}>{visit.schemeName}</Text>
			</View>
			{canPlan ? (
				saving ? (
					<ActivityIndicator color={colors.primary} />
				) : (
					<Pressable
						style={styles.planButton}
						onPress={(e) => {
							e.stopPropagation();
							onOpenPicker();
						}}
					>
						<Text style={styles.planButtonText}>{needsDate ? t('calendar.setDate') : t('calendar.change')}</Text>
					</Pressable>
				)
			) : null}
			{pickerOpen ? (
				<DateTimePicker
					value={visit.scheduledDate ? parseIsoDate(visit.scheduledDate) : new Date()}
					mode="date"
					display="default"
					onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
						if (event.type === 'set' && selectedDate) onPickDate(toIsoDate(selectedDate));
						else onCancelPicker();
					}}
				/>
			) : null}
		</Pressable>
	);
}

function buildSections(unscheduled: SiteVisitSummary[], scheduled: SiteVisitSummary[], needsDateTitle: string): Section[] {
	const sections: Section[] = [];
	if (unscheduled.length) sections.push({ title: needsDateTitle, data: unscheduled });

	const byDate = new Map<string, SiteVisitSummary[]>();
	for (const visit of scheduled) {
		if (!visit.scheduledDate) continue;
		const group = byDate.get(visit.scheduledDate) ?? [];
		group.push(visit);
		byDate.set(visit.scheduledDate, group);
	}
	const dates = [...byDate.keys()].sort();
	for (const date of dates) sections.push({ title: formatSectionDate(date), data: byDate.get(date)! });

	return sections;
}

function formatSectionDate(isoDate: string) {
	return parseIsoDate(isoDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function parseIsoDate(value: string) {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

function toIsoDate(value: Date) {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
	const result = new Date(value);
	result.setDate(result.getDate() + days);
	return result;
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
	title: { color: colors.textPrimary, fontSize: typography.size.xxl, fontWeight: typography.weight.bold },
	subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.md },
	error: { color: colors.error, marginBottom: spacing.sm, lineHeight: typography.lineHeight.md },
	loader: { margin: spacing.xl },
	empty: { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
	list: { paddingBottom: spacing.xl },
	sectionHeader: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.sm },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		backgroundColor: colors.surface,
		borderColor: colors.border,
		borderWidth: 1,
		borderRadius: radius.md,
		padding: spacing.md,
		marginBottom: spacing.sm,
	},
	rowText: { flex: 1, marginRight: spacing.sm },
	uid: { color: colors.primaryDark, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
	schemeName: { color: colors.textPrimary, fontSize: typography.size.sm, fontWeight: typography.weight.medium, marginTop: spacing.xs },
	planButton: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
	planButtonText: { color: colors.white, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
});
