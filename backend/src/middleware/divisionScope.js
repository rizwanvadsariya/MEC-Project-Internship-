/**
 * For RD/DG, injects req.scope.divisionId so every later scheme/team/visit
 * query filters by the caller's division (schema.md §5). Must run after
 * authorize() — it reads req.authUser. A no-op for MEO/Support (their scoping
 * is by team membership, not division — handled at the repository level).
 */
'use strict';

const { ROLES } = require('../constants/roles');

const DIVISION_SCOPED_ROLES = new Set([ROLES.REGIONAL_DIRECTOR, ROLES.DIRECTOR_GENERAL]);

module.exports = function divisionScope(req, _res, next) {
  req.scope = req.scope || {};
  if (req.authUser && DIVISION_SCOPED_ROLES.has(req.authUser.role)) {
    req.scope.divisionId = req.authUser.divisionId;
  }
  next();
};
