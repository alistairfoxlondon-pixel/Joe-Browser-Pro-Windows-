import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Where everything lives.
 *
 * Profile data belongs under the user's roaming profile and nowhere else: no ProgramData, no
 * registry, no cloud. A per-user install that writes only inside %APPDATA% is what lets the
 * installer run without an administrator prompt, and it is what makes "delete this folder"
 * a complete uninstall.
 */

const APP_DIR_NAME = 'JoeBrowser';

function resolveRoot(): string {
  // An explicit override exists for portable builds and for tests.
  const override = process.env.JOE_BROWSER_DATA_DIR;
  if (override && override.trim()) return path.resolve(override);

  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));

  return path.join(appData, APP_DIR_NAME);
}

export const Paths = {
  get root(): string {
    return resolveRoot();
  },
  get profiles(): string {
    return path.join(this.root, 'profiles');
  },
  get kernels(): string {
    return path.join(this.root, 'kernels');
  },
  get extensions(): string {
    return path.join(this.root, 'extensions');
  },
  get logs(): string {
    return path.join(this.root, 'logs');
  },
  get theme(): string {
    return path.join(this.root, 'theme.json');
  },
  storeFile(name: string): string {
    return path.join(this.root, name);
  },
  /** The browser's own user-data-dir for a profile. */
  profileData(id: string): string {
    return path.join(this.profiles, id);
  },
  ensure(...dirs: string[]): void {
    for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
  },
};
