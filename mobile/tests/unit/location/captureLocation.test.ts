/**
 * Unit: captureCurrentLocation's permission + degrade-gracefully contract
 * (phases.md Step 19). Mocks expo-location entirely, so this never touches a
 * real device GPS or permission dialog.
 */
'use strict';

jest.mock('expo-location', () => ({
	getForegroundPermissionsAsync: jest.fn(),
	requestForegroundPermissionsAsync: jest.fn(),
	getCurrentPositionAsync: jest.fn(),
	Accuracy: { Balanced: 3 },
}));

import * as Location from 'expo-location';
import { captureCurrentLocation } from '../../../src/location/captureLocation';

const locationMock = Location as unknown as {
	getForegroundPermissionsAsync: jest.Mock;
	requestForegroundPermissionsAsync: jest.Mock;
	getCurrentPositionAsync: jest.Mock;
};

beforeEach(() => {
	jest.clearAllMocks();
	jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	jest.restoreAllMocks();
});

test('returns coordinates when permission is already granted', async () => {
	locationMock.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
	locationMock.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 24.8607, longitude: 67.0011 } });

	const result = await captureCurrentLocation();

	expect(result).toEqual({ geoLat: 24.8607, geoLng: 67.0011 });
	expect(locationMock.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test('requests permission when not already granted, and proceeds once granted', async () => {
	locationMock.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
	locationMock.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
	locationMock.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });

	const result = await captureCurrentLocation();

	expect(locationMock.requestForegroundPermissionsAsync).toHaveBeenCalled();
	expect(result).toEqual({ geoLat: 1, geoLng: 2 });
});

test('returns null (never throws) when permission is denied', async () => {
	locationMock.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
	locationMock.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

	const result = await captureCurrentLocation();

	expect(result).toBeNull();
	expect(locationMock.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test('returns null (never throws) when getCurrentPositionAsync fails, e.g. GPS disabled or timeout', async () => {
	locationMock.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
	locationMock.getCurrentPositionAsync.mockRejectedValue(new Error('Location request timed out'));

	const result = await captureCurrentLocation();

	expect(result).toBeNull();
});

test('returns null (never throws) when the permission check itself throws', async () => {
	locationMock.getForegroundPermissionsAsync.mockRejectedValue(new Error('Location services unavailable'));

	const result = await captureCurrentLocation();

	expect(result).toBeNull();
});
