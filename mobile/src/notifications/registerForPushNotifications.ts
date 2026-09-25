/**
 * Requests notification permission, fetches this device's Expo push token,
 * and registers it with the backend. Deliberately never throws — a phone
 * with permission denied, running in a simulator, or missing an EAS
 * projectId (see the README note this file's header points to) should never
 * block login or crash the app; it should just silently have no push token
 * registered, same "can't verify without a real device" precedent as the
 * MFA/login-screen work documented in Memory.md.
 *
 * IMPORTANT — do not add a static `import ... from 'expo-notifications'` at
 * the top of this file. Since Expo SDK 53, remote push notifications were
 * removed from Expo Go on Android, and merely *importing* expo-notifications
 * there throws a fatal red-box error (it wires up an internal push-token
 * listener as a module-load side effect) — this isn't limited to actually
 * calling a push API. The module is loaded with a dynamic `import()` below,
 * only after confirming we're not in that exact situation, precisely to
 * avoid that crash. Confirmed live against a real device (see chat history).
 *
 * KNOWN LIMITATION (flagged, not fixed here — needs the user's own Expo
 * account): this repo has no EAS project configured (no `extra.eas.projectId`
 * in app.config.js), which getExpoPushTokenAsync requires. Until `eas init`
 * is run and a projectId is added, this resolves to a no-op everywhere. Even
 * once that's done, Android push still needs a real dev/production build —
 * Expo Go on Android cannot receive remote push at all (see above). iOS Expo
 * Go and local (in-foreground) notifications are unaffected by either gap.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { registerPushToken } from '../api/notifications.api';

/** True when running inside the Expo Go client app, not a dev/production build. */
function isExpoGo(): boolean {
	return Constants.executionEnvironment === 'storeClient';
}

function getProjectId(): string | undefined {
	const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
	return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

let notificationHandlerConfigured = false;

export async function registerForPushNotifications(accessToken: string): Promise<void> {
	try {
		if (Platform.OS === 'android' && isExpoGo()) {
			console.warn('[push] Skipping push registration — Expo Go on Android no longer supports remote push (SDK 53+). Use a development build to test this.');
			return;
		}

		if (!Device.isDevice) return; // simulators/emulators have no push token

		const Notifications = await import('expo-notifications');

		if (!notificationHandlerConfigured) {
			Notifications.setNotificationHandler({
				handleNotification: async () => ({
					shouldShowBanner: true,
					shouldShowList: true,
					shouldPlaySound: false,
					shouldSetBadge: false,
				}),
			});
			notificationHandlerConfigured = true;
		}

		if (Platform.OS === 'android') {
			await Notifications.setNotificationChannelAsync('default', {
				name: 'default',
				importance: Notifications.AndroidImportance.DEFAULT,
			});
		}

		const existing = await Notifications.getPermissionsAsync();
		let status = existing.status;
		if (status !== 'granted') {
			const requested = await Notifications.requestPermissionsAsync();
			status = requested.status;
		}
		if (status !== 'granted') return;

		const projectId = getProjectId();
		if (!projectId) {
			console.warn('[push] No EAS projectId configured (app.config.js extra.eas.projectId) — skipping push token registration. Run `eas init` to enable real push delivery.');
			return;
		}

		const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
		await registerPushToken(accessToken, expoPushToken, Platform.OS === 'ios' ? 'ios' : 'android');
	} catch (err) {
		console.warn('[push] Could not register for push notifications (non-fatal):', err instanceof Error ? err.message : err);
	}
}
