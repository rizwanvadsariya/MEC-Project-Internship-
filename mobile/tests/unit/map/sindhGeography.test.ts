/**
 * Unit: every real district name in the ADP source CSV
 * (adp-database-seed-csv/districts.csv — read directly, not re-typed here)
 * has a real-world coordinate in sindhGeography.ts, and every coordinate is
 * plausibly within Sindh's own bounding box. Mirrors the exact
 * read-the-real-source-file pattern dynamicFormFields.test.ts already
 * established for Step 22, so this catches the hardcoded coordinate table
 * and the actual seeded reference data silently drifting apart (a district
 * renamed in a future CSV update would fail this test, not render as a
 * silently-missing pin on the map).
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { DISTRICT_COORDINATES, SINDH_BOUNDS, SINDH_CENTER, MIN_ZOOM, MAX_ZOOM, getDistrictCoordinates } from '../../../src/map/sindhGeography';

function loadCsvNames(fileName: string, nameColumnIndex: number): string[] {
	const csvPath = path.resolve(__dirname, '../../../../adp-database-seed-csv', fileName);
	const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
	const [, ...rows] = lines; // drop header
	return rows.map((line) => line.split(',')[nameColumnIndex]);
}

const realDistrictNames = loadCsvNames('districts.csv', 2); // id,division_id,name

describe('sindhGeography vs. the real ADP source CSV', () => {
	test('the CSV actually has real rows (sanity check the read path)', () => {
		expect(realDistrictNames.length).toBeGreaterThan(20);
	});

	test.each(realDistrictNames)('DISTRICT_COORDINATES has an entry for real district "%s"', (name) => {
		expect(DISTRICT_COORDINATES[name]).toBeDefined();
	});

	test('no stray/unmapped entries beyond the real district list (no silent typo divergence)', () => {
		const realSet = new Set(realDistrictNames);
		const extra = Object.keys(DISTRICT_COORDINATES).filter((name) => !realSet.has(name));
		expect(extra).toEqual([]);
	});

	test.each(Object.entries(DISTRICT_COORDINATES))('district "%s" coordinate falls within SINDH_BOUNDS', (_name, coord) => {
		expect(coord.lat).toBeGreaterThanOrEqual(SINDH_BOUNDS.south);
		expect(coord.lat).toBeLessThanOrEqual(SINDH_BOUNDS.north);
		expect(coord.lng).toBeGreaterThanOrEqual(SINDH_BOUNDS.west);
		expect(coord.lng).toBeLessThanOrEqual(SINDH_BOUNDS.east);
	});
});

describe('SINDH_BOUNDS / SINDH_CENTER / zoom limits', () => {
	test('SINDH_CENTER itself falls within SINDH_BOUNDS', () => {
		expect(SINDH_CENTER.lat).toBeGreaterThanOrEqual(SINDH_BOUNDS.south);
		expect(SINDH_CENTER.lat).toBeLessThanOrEqual(SINDH_BOUNDS.north);
		expect(SINDH_CENTER.lng).toBeGreaterThanOrEqual(SINDH_BOUNDS.west);
		expect(SINDH_CENTER.lng).toBeLessThanOrEqual(SINDH_BOUNDS.east);
	});

	test('bounds are a real, non-degenerate box (north > south, east > west)', () => {
		expect(SINDH_BOUNDS.north).toBeGreaterThan(SINDH_BOUNDS.south);
		expect(SINDH_BOUNDS.east).toBeGreaterThan(SINDH_BOUNDS.west);
	});

	test('MIN_ZOOM (the "can\'t zoom out past whole Sindh" limit) is strictly less than MAX_ZOOM', () => {
		expect(MIN_ZOOM).toBeLessThan(MAX_ZOOM);
	});
});

describe('getDistrictCoordinates', () => {
	test('returns the real coordinate for a known district', () => {
		expect(getDistrictCoordinates('Hyderabad')).toEqual(DISTRICT_COORDINATES.Hyderabad);
	});

	test('returns null for an unknown/garbled district name, never throws', () => {
		expect(getDistrictCoordinates('Not A Real District')).toBeNull();
	});
});
