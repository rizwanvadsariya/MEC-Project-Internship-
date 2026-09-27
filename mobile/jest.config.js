/** Real tests started with the offline-queue/sync-manager suite (Step 18,
 *  tests/unit/offline/) — passWithNoTests stays on so any future area of
 *  the app that hasn't grown its own tests yet still doesn't fail CI on
 *  "no tests found". */
module.exports = {
  preset: 'jest-expo',
  passWithNoTests: true,
};
