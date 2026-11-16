import { rmSync } from 'node:fs';

for (const target of ['dist']) {
  rmSync(target, { recursive: true, force: true });
}

console.log('dist cleared');
