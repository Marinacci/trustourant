const { spawnSync } = require('node:child_process');
const path = require('node:path');

function runNodeScript(script) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) process.exit(result.status || 1);
}

if (process.env.RENDER === 'true') {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error('[postinstall] npm executable not available');
    process.exit(1);
  }

  console.log('[postinstall] Rebuilding sqlite3 for the Render runtime');
  const rebuild = spawnSync(process.execPath, [npmCli, 'rebuild', 'sqlite3'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_build_from_source: 'true',
    },
  });

  if (rebuild.status !== 0) process.exit(rebuild.status || 1);
}

runNodeScript('check-deployment-config.js');
