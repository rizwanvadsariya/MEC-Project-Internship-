/** Role + team-role names shared by backend and mobile so the two never drift.
 *  Mirrors schema.md §4.1. */
'use strict';
const ROLES = Object.freeze({
  REGIONAL_DIRECTOR: 'REGIONAL_DIRECTOR',
  DIRECTOR_GENERAL: 'DIRECTOR_GENERAL',
  MEO: 'MEO',
  SUPPORT_USER: 'SUPPORT_USER',
});
const TEAM_ROLES = Object.freeze({
  LEAD_MEO: 'LEAD_MEO',
  SUPPORT_MEO: 'SUPPORT_MEO',
  DEPT_MEMBER: 'DEPT_MEMBER',
  RD_OBSERVER: 'RD_OBSERVER',
});
module.exports = { ROLES, TEAM_ROLES };
