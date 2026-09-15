'use strict';
// Validate before a Render build finishes, so an invalid configuration never
// replaces the currently deployed service. Never print configuration values.
if (process.env.RENDER === 'true') {
  const path = require('path');
  const secretOK = Boolean(process.env.JWT_SECRET) && process.env.JWT_SECRET !== 'trustourant-secret-key-change-in-production';
  const db = process.env.DB_PATH;
  const databaseOK = Boolean(db) && path.resolve(db).startsWith('/var/data/');
  console.log(`[deployment-check] JWT_SECRET=${secretOK ? 'configured' : 'missing-or-insecure'} DB_PATH=${databaseOK ? 'persistent' : 'missing-or-nonpersistent'}`);
  if (!secretOK || !databaseOK) {
    console.error('Deployment stopped before replacing the live service: configure a private JWT_SECRET and the existing persistent DB_PATH. Do not create a new empty database.');
    process.exitCode = 1;
  }
}
