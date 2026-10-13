import { AppState } from 'react-native';

import { getContext, getScreen, setContextRideId, setContextScreen } from './context';
import type { EventName } from './events';
import { enqueueError, enqueueEvent, flushTelemetry, type ErrorRow } from './queue';

export { EVENTS, type EventName } from './events';

// PRIVACY: props/extra may only hold fixed enums, booleans and counts (e.g. kind, code_error).
// Never put coordinates, rider names, ride codes or any free text typed by a user in them.

type Props = Record<string, string | number | boolean | null>;
type ErrorKind = ErrorRow['kind'];

const MAX_MESSAGE = 2000;
const MAX_STACK = 20000;
const FLUSH_INTERVAL_MS = 30_000;

export function track(name: EventName, props?: Props): void {
  try {
    const ctx = getContext();
    enqueueEvent({
      name,
      props: props ?? {},
      screen: ctx.screen,
      ride_id: ctx.ride_id,
      session_id: ctx.session_id,
      platform: ctx.platform,
      os_version: ctx.os_version,
      app_version: ctx.app_version,
      device_model: ctx.device_model,
      client_at: new Date().toISOString(),
    });
  } catch {
    // Telemetry never throws.
  }
}

export function setScreen(path: string): void {
  try {
    if (!path || path === getScreen()) return;
    setContextScreen(path);
    track('screen.viewed');
  } catch {
    // ignore
  }
}

export function setTelemetryRideId(id: string | null): void {
  setContextRideId(id);
}

export interface ReportErrorOptions {
  kind?: 'js_error' | 'render' | 'background_task';
  fatal?: boolean;
  componentStack?: string;
  extra?: Record<string, unknown>;
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  }
  try {
    const text = typeof error === 'string' ? error : JSON.stringify(error);
    return { message: text ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

function safeExtra(extra: Record<string, unknown> | undefined): ErrorRow['extra'] {
  if (!extra) return {};
  try {
    const json = JSON.stringify(extra);
    return json.length <= 3500 ? (JSON.parse(json) as ErrorRow['extra']) : {};
  } catch {
    return {};
  }
}

/** Synchronous enqueue (no network), so it is safe to call right before the process dies. */
function record(kind: ErrorKind, error: unknown, opts: ReportErrorOptions = {}): void {
  try {
    const { message, stack } = describe(error);
    const ctx = getContext();
    enqueueError({
      kind,
      is_fatal: kind === 'js_fatal' || opts.fatal === true,
      message: message.slice(0, MAX_MESSAGE),
      stack: stack ? stack.slice(0, MAX_STACK) : null,
      component_stack: opts.componentStack ? opts.componentStack.slice(0, MAX_STACK) : null,
      screen: ctx.screen,
      ride_id: ctx.ride_id,
      session_id: ctx.session_id,
      platform: ctx.platform,
      os_version: ctx.os_version,
      app_version: ctx.app_version,
      device_model: ctx.device_model,
      extra: safeExtra(opts.extra),
      client_at: new Date().toISOString(),
    });
  } catch {
    // ignore
  }
}

export function reportError(error: unknown, opts?: ReportErrorOptions): void {
  record(opts?.kind ?? 'js_error', error, opts);
  // A fatal report stays queued and is sent on the next launch.
  if (!opts?.fatal) void flushTelemetry();
}

// ---------------------------------------------------------------- global handlers

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

interface RNErrorUtils {
  getGlobalHandler(): GlobalHandler;
  setGlobalHandler(handler: GlobalHandler): void;
}

interface HermesRejectionTracker {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
    onHandled?: (id: number) => void;
  }) => void;
}

function installHandlers(): void {
  try {
    const errorUtils = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
    if (errorUtils) {
      const previous = errorUtils.getGlobalHandler();
      errorUtils.setGlobalHandler((error, isFatal) => {
        // Fatal: persist synchronously first, the app is about to die.
        record(isFatal ? 'js_fatal' : 'js_error', error);
        previous?.(error, isFatal);
      });
    }
  } catch {
    // ignore
  }
  try {
    // React Native only installs its own tracker in __DEV__ (yellow-box warnings) and Hermes keeps a
    // single tracker, so ours is installed in release builds only. RN has no separate official API.
    const hermes = (globalThis as { HermesInternal?: HermesRejectionTracker }).HermesInternal;
    if (!__DEV__ && hermes?.enablePromiseRejectionTracker) {
      hermes.enablePromiseRejectionTracker({
        allRejections: true,
        onUnhandled: (_id, error) => {
          record('unhandled_rejection', error);
          void flushTelemetry();
        },
      });
    }
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- lifecycle

let initialized = false;

export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;
  try {
    installHandlers();
    track('app.opened');
    void flushTelemetry();
    setInterval(() => void flushTelemetry(), FLUSH_INTERVAL_MS);
    AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        track('app.backgrounded');
        void flushTelemetry();
      }
    });
  } catch {
    // ignore
  }
}
