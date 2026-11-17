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
 *
 * A portable build keeps its data beside the executable instead, which the original expressed
 * with a `portable.txt` beside the binary. A USB stick that leaves nothing on the host is a
 * real requirement for this kind of tool, so the same marker is honoured here.
 */

const APP_DIR_NAME = 'JoeBrowser';

/** True when `portable.txt` sits beside the executable. */
function portable(): boolean {
  const markers = [
    process.env['PORTABLE_EXECUTABLE_DIR'],
    process.env['JOE_BROWSER_PORTABLE_DIR'],
    path.dirname(process.execPath),
  ].filter(Boolean) as string[];

  for (const dir of markers) {
    try {
      if (fs.existsSync(path.join(dir, 'portable.txt'))) return true;
    } catch {
      /* a directory that cannot be read is not portable */
    }
  }
  return false;
}

const isPortable = portable();

function resolveRoot(): string {
  // An explicit override exists for portable builds and for tests.
  const override = process.env.JOE_BROWSER_DATA_DIR;
  if (override && override.trim()) return path.resolve(override);

  if (isPortable) {
    const base = process.env['PORTABLE_EXECUTABLE_DIR'] ?? path.dirname(process.execPath);
    return path.join(base, 'userdata');
  }

  const appData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));

  return path.join(appData, APP_DIR_NAME);
}

export const Paths = {
  get portable(): boolean {
    return isPortable;
  },
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
  get history(): string {
    return path.join(this.root, 'history');
  },
  get trash(): string {
    return path.join(this.root, 'trash');
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
  /** True when the data folder is writable. A read-only %APPDATA% loses every profile silently. */
  writable(): boolean {
    try {
      fs.mkdirSync(this.root, { recursive: true });
      const probe = path.join(this.root, '.write-test');
      fs.writeFileSync(probe, 'ok');
      fs.rmSync(probe, { force: true });
      return true;
    } catch {
      return false;
    }
  },
};
