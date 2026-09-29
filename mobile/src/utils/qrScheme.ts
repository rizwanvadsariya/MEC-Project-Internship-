/**
 * Step 28 — pure, framework-free helper for turning whatever text a camera
 * scan (or a manually retyped code) produces into a scheme uid lookup key.
 *
 * Confirmed from a real printed ADP booklet page (user-reported, 2026-09-30):
 * the actual QR code encodes a full government portal URL with the uid as a
 * query parameter — e.g.
 * "https://bbms.sferp.gos.pk/public/scheme?uid=AZUAQ-PP-19-0015" — not the
 * bare uid this project originally guessed at (no real booklet was available
 * to verify against when Step 28 was first built). The `uid` query parameter
 * is extracted via regex rather than the `URL`/`URLSearchParams` globals,
 * which aren't reliably available under Hermes without a polyfill this
 * project doesn't otherwise need. A bare uid (manually retyped, or some
 * future/other booklet format) still works unchanged — if there's no `uid=`
 * parameter to extract, the trimmed raw text is used as-is.
 *
 * The backend's own GET /schemes/by-uid/:uid is already case-insensitive and
 * trims (scheme.repo.findByUid), but the empty/whitespace-only case has to be
 * caught here, before ever making a network call — an empty scan should
 * never look like "no scheme found", it should never fire a request at all.
 */
export function normalizeScannedSchemeCode(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;

	const uidParamMatch = trimmed.match(/[?&]uid=([^&#]+)/i);
	if (uidParamMatch) {
		let value = uidParamMatch[1];
		try {
			value = decodeURIComponent(value);
		} catch {
			// Malformed percent-encoding — fall back to the raw matched text
			// rather than throwing away an otherwise-readable uid.
		}
		value = value.trim();
		return value.length > 0 ? value : null;
	}

	return trimmed;
}
