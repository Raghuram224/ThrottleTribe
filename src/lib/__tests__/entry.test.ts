/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');

// A headless background launch can deliver a location update before Expo Router has loaded any route file, so
// the task must be defined by the entry itself, ahead of `expo-router/entry`.
describe('app entry', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { main: string };
  const imports = readFileSync(join(root, pkg.main), 'utf8')
    .split('\n')
    .map((l) => /^import\s+'([^']+)';/.exec(l)?.[1])
    .filter((m): m is string => !!m);

  it('is a custom entry, not expo-router/entry itself', () => {
    expect(pkg.main).toBe('index.js');
  });

  it('defines the location task before Expo Router loads, and registers the router last', () => {
    const task = imports.indexOf('@/lib/location/background-task');
    const router = imports.indexOf('expo-router/entry');
    expect(task).toBeGreaterThanOrEqual(0);
    expect(router).toBe(imports.length - 1);
    expect(task).toBeLessThan(router);
  });

  it('is not left to the root layout (route files load lazily)', () => {
    const layout = readFileSync(join(root, 'src', 'app', '_layout.tsx'), 'utf8');
    expect(layout).not.toMatch(/^import '@\/lib\/location\/background-task';/m);
  });

  // The entry evaluates this at bundle load, maybe in a runtime that is still starting: expo-battery, sqlite and the
  // rest read native modules as they load (seen: "Cannot read property 'EventEmitter' of undefined" after a headless
  // relaunch). Their module runs on the first fix instead.
  it('keeps the boot-time task module free of heavy imports', () => {
    const src = readFileSync(join(root, 'src', 'lib', 'location', 'background-task.ts'), 'utf8');
    const staticImports = [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]);
    expect(staticImports.sort()).toEqual(['./task-name', 'expo-task-manager']);
  });
});
