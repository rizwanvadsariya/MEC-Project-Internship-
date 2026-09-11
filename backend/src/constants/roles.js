'use strict';

const ROLES = Object.freeze({
  REGIONAL_DIRECTOR: 'REGIONAL_DIRECTOR',
  DIRECTOR_GENERAL: 'DIRECTOR_GENERAL',
  MEO: 'MEO',
  SUPPORT_USER: 'SUPPORT_USER',
});

/** DG/RD — a compromised account here sees a whole division's data and can
 *  approve/reject teams, so both MFA enforcement (authorize.js) and login
 *  lockout alerting (auth.service.js) treat them as higher-value targets. */
const HIGH_VALUE_ROLES = Object.freeze([ROLES.DIRECTOR_GENERAL, ROLES.REGIONAL_DIRECTOR]);

module.exports = { ROLES, HIGH_VALUE_ROLES };
