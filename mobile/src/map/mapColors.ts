/**
 * Step 30 — GIS map view. Pure color-selection logic for the two coloring
 * modes (progress / issue severity), kept framework-free so it's testable
 * without rendering anything — matches AnalyticsScreen.tsx's own
 * dependency-free, no-chart-library precedent, just applied to a map tile's
 * fill color instead of a progress-bar width.
 *
 * Deliberately reuses only the theme's existing success/warning/error/border
 * tokens rather than introducing new hex values — a 3-tier scale (green/
 * amber/red) plus a neutral "no data yet" gray, same semantic vocabulary
 * ProgressReconciliationScreen.tsx's own gapColor() already established for
 * this app's color-by-severity convention.
 */
import { colors } from '../theme';

export type ProgressColorTheme = { success: string; warning: string; error: string; border: string };

const DEFAULT_THEME: ProgressColorTheme = {
	success: colors.success,
	warning: colors.warning,
	error: colors.error,
	border: colors.border,
};

/** >=75% green, >=40% amber, otherwise red; `null` (no visit report
 *  submitted yet for any scheme in this district) is neutral gray, never
 *  coerced to 0% — the same "don't imply bad data where there's just no
 *  data" rule AnalyticsScreen.formatPct already follows. */
export function colorForProgress(avgProgressPct: number | null, theme: ProgressColorTheme = DEFAULT_THEME): string {
	if (avgProgressPct === null) return theme.border;
	if (avgProgressPct >= 75) return theme.success;
	if (avgProgressPct >= 40) return theme.warning;
	return theme.error;
}

export type SeverityBreakdown = { openIssues: number; critical: number; high: number };

/** No breakdown at all (MEO/Support, or an RD/DG viewing a district outside
 *  their own division) renders the same neutral gray as "no data yet" —
 *  this map never implies "zero issues" for a district it was never told
 *  about. Zero open issues is its own, different, deliberately reassuring
 *  green. Any CRITICAL or HIGH open issue is red; MEDIUM/LOW-only is amber. */
export function colorForSeverity(breakdown: SeverityBreakdown | null | undefined, theme: ProgressColorTheme = DEFAULT_THEME): string {
	if (!breakdown) return theme.border;
	if (breakdown.openIssues === 0) return theme.success;
	if (breakdown.critical > 0 || breakdown.high > 0) return theme.error;
	return theme.warning;
}
