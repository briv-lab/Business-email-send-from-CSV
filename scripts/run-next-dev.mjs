import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

import packageJson from '../package.json' with { type: 'json' };

function getElectronStyleUserDataPath() {
  const appName = packageJson.build?.productName || packageJson.name || 'EdiProspect';

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }

  if (process.platform === 'win32') {
    const roamingAppData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(roamingAppData, appName);
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, appName);
}

const child = spawn(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'next', 'dev'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      APPDATA_DIR: process.env.APPDATA_DIR || getElectronStyleUserDataPath(),
    },
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
