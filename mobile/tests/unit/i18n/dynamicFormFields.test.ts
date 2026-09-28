/**
 * Unit: every fieldKey and select/multiselect option value actually present
 * in the real seed data (backend/db/seeds/seedFormTemplates.js, read
 * directly — not re-typed here) has a translated entry for all 3 languages
 * in dynamicFormFields.ts (phases.md Step 22). Catches the DB seed and the
 * client-side translation map silently drifting apart.
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { FIELD_LABELS, OPTION_LABELS } from '../../../src/i18n/translations/dynamicFormFields';
import { SUPPORTED_LANGUAGES } from '../../../src/i18n/languages';

/**
 * The seed file lives in the backend package (its own node_modules — `pg`,
 * `dotenv` — isn't reachable from here, and running it through Jest's
 * transform pipeline as a require() also fails to resolve @babel/runtime
 * from outside the mobile package root). Rather than require() it — which
 * would need the whole module including its DB-connection code — this reads
 * the file as plain text and evaluates just the static `FIELD_SETS` object
 * literal, which has no external dependencies. Still reads the *real* file
 * directly (not re-typed/duplicated here), so it stays honest if the seed
 * data changes.
 */
function loadRealFieldSets(): Record<string, Array<{ fieldKey: string; fieldType: string; options?: string[] }>> {
	const seedFilePath = path.resolve(__dirname, '../../../../backend/db/seeds/seedFormTemplates.js');
	const source = fs.readFileSync(seedFilePath, 'utf8');
	const match = source.match(/const FIELD_SETS = (\{[\s\S]*?\r?\n\});\r?\n/);
	if (!match) throw new Error('Could not locate the FIELD_SETS object literal in seedFormTemplates.js — has its shape changed?');
	// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- evaluating a static object literal read from our own repo's source file, not external input.
	return new Function(`return (${match[1]});`)();
}

const FIELD_SETS = loadRealFieldSets();

type SeedField = { fieldKey: string; fieldType: string; options?: string[] };

const allFields: SeedField[] = Object.values(FIELD_SETS).flat() as SeedField[];
const allFieldKeys = [...new Set(allFields.map((field) => field.fieldKey))];
const allOptionValues = [...new Set(allFields.flatMap((field) => field.options ?? []))];

describe('dynamicFormFields translation coverage vs. the real seed data', () => {
	test('the seed file actually defines fields (sanity check the require path)', () => {
		expect(allFieldKeys.length).toBeGreaterThan(10);
		expect(allOptionValues.length).toBeGreaterThan(10);
	});

	test.each(allFieldKeys)('FIELD_LABELS has an entry for seed fieldKey "%s"', (fieldKey) => {
		expect(FIELD_LABELS[fieldKey]).toBeDefined();
	});

	test.each(allFieldKeys)('FIELD_LABELS["%s"] has a non-empty translation for every supported language', (fieldKey) => {
		for (const lang of SUPPORTED_LANGUAGES) {
			expect(FIELD_LABELS[fieldKey]?.[lang]?.trim()).toBeTruthy();
		}
	});

	test.each(allOptionValues)('OPTION_LABELS has an entry for seed option value "%s"', (option) => {
		expect(OPTION_LABELS[option]).toBeDefined();
	});

	test.each(allOptionValues)('OPTION_LABELS["%s"] has a non-empty translation for every supported language', (option) => {
		for (const lang of SUPPORTED_LANGUAGES) {
			expect(OPTION_LABELS[option]?.[lang]?.trim()).toBeTruthy();
		}
	});
});
