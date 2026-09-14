/** No test files exist yet (Phase 0 app shell) — passWithNoTests keeps CI
 *  green until the first real screen/hook test is written, instead of
 *  failing on "no tests found". */
module.exports = {
  preset: 'jest-expo',
  passWithNoTests: true,
};
