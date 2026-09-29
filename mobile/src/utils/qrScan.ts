/**
 * Step 28 follow-up — pure zoom-step math for QrScanScreen's manual zoom
 * control. Narrowing the camera's field of view is the mitigation for real
 * ADP booklet pages packing multiple QR codes close together (see
 * QrScanScreen.tsx's own header comment for the full story) — kept as a pure,
 * testable function rather than inline arithmetic in the screen.
 */
export const DEFAULT_ZOOM = 0.5;
export const ZOOM_STEP = 0.15;
export const MIN_ZOOM = 0;
export const MAX_ZOOM = 1;

export function clampZoom(value: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}
