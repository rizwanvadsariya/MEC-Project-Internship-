/**
 * Best-effort reload after an I18nManager.forceRTL(...) call, so the new
 * layout direction takes visual effect immediately instead of only on the
 * next cold start. Follows the exact guarded-dynamic-import pattern already
 * established by mobile/src/notifications/registerForPushNotifications.ts
 * (Memory.md Step 17: "never add a static top-level import... always
 * dynamic-import it behind a guard, never throws") — expo-updates is not a
 * declared dependency of this project (see package.json) and must not become
 * a hard one; if it isn't installed/usable (e.g. Expo Go), the dynamic
 * import throws and is swallowed here, and the caller falls back to asking
 * the user to fully close and reopen the app.
 *
 * Returns true if a reload was actually triggered (the caller won't run any
 * further code in that case — the app is about to restart), false if the
 * caller should show the "please restart the app" message instead.
 */
export async function attemptRtlReload(): Promise<boolean> {
  try {
    // @ts-expect-error -- expo-updates is not a declared dependency (see comment above), so its module/type declarations don't resolve; that's the point of the dynamic-import guard.
    // eslint-disable-next-line import/no-unresolved -- expo-updates is not a project dependency; its path can't be resolved.
    const Updates = (await import('expo-updates')) as any;
    if (typeof Updates?.reloadAsync !== 'function') return false;
    await Updates.reloadAsync();
    return true;
  } catch {
    // Not installed, or reloadAsync isn't usable in this runtime (e.g. Expo
    // Go) — degrade gracefully, same as every other native-module-adjacent
    // helper in this project.
    return false;
  }
}
