const { Settings } = require("../models");

// Haversine distance in metres between two [lng, lat] pairs.
function distanceMeters([lng1, lat1], [lng2, lat2]) {
	const R = 6371000;
	const toRad = (d) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(a));
}

// Evaluates an inspection GPS fix against a scheme's captured location pin.
// Schemes without a location pin (ADP source is district-level only) pass by
// default with distance null.
async function evaluate({ scheme, gpsCoordinates }) {
	const settings = await Settings.getGlobal();
	const radius = settings.geofenceRadiusMeters;
	if (!scheme.location || !scheme.location.coordinates) {
		return { geofencePassed: true, distanceFromSchemeMeters: 0, radius, hasPin: false };
	}
	const distance = distanceMeters(scheme.location.coordinates, gpsCoordinates);
	return {
		geofencePassed: distance <= radius,
		distanceFromSchemeMeters: Math.round(distance),
		radius,
		hasPin: true,
	};
}

module.exports = { distanceMeters, evaluate };
