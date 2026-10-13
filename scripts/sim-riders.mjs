#!/usr/bin/env node
// Throttle Tribe rider simulator: bot riders (anonymous auth) that join a ride by code and
// replay scripted GPS along a Bengaluru -> Mysuru route, with scenarios (fuel stop, tunnel,
// SOS, lagging). Optionally drives the Android emulator GPS for the human leader.
//
//   node --env-file=.env scripts/sim-riders.mjs --code 123456 [--riders 4] [--tick 5]
//        [--emulator emulator-5554] [--route mysuru] [--duration 900] [--propose 60]
//
// --propose <sec>: that many seconds after the ride becomes active, Priya (bot 1) proposes a coffee
// break at a real cafe near her position (Photon lookup; fallback: a known cafe on the Mysuru road).
//
// Times below are seconds since the ride became active.

import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

// ------------------------------------------------------------------ config
const CONFIG = {
  names: ['Arun', 'Priya', 'Karthik', 'Meena', 'Ravi', 'Divya', 'Suresh', 'Anitha'],
  baseSpeedsKmh: [62, 55, 70, 48, 58, 65, 52, 60],
  maxRiders: 8,
  statusPollMs: 3000,
  emulatorKmh: 60,
  emulatorStepMs: 2000,
  emulatorLobbyStepMs: 5000,
  // scenario per bot index; missing index -> 'steady'
  scenarios: {
    0: { type: 'fuel_stop', at: 120, stopFor: 240 },
    1: { type: 'tunnel', at: 90, offlineFor: 100 },
    2: { type: 'sos', at: 200, stopFor: 120 },
    3: { type: 'lagging', speedKmh: 40 },
  },
};

// Fallback only: a coarse straight-line Bengaluru -> Mysuru polyline, [lat, lng]. The real,
// road-snapped route is scripts/routes/<name>.json (OSRM, fetched once and committed; see below).
const ROUTES = {
  mysuru: [
    [12.952, 77.54], [12.944, 77.515], [12.93, 77.49], [12.91, 77.465], [12.88, 77.435],
    [12.848, 77.41], [12.797, 77.388], [12.765, 77.335], [12.721, 77.281], [12.685, 77.24],
    [12.651, 77.207], [12.625, 77.15], [12.6, 77.09], [12.584, 77.045], [12.565, 76.98],
    [12.522, 76.895], [12.49, 76.82], [12.455, 76.74], [12.422, 76.694], [12.36, 76.66],
    [12.2958, 76.6394],
  ],
};

/** Road-snapped route from scripts/routes/<name>.json ([lat, lng][]); falls back to the coarse polyline. */
function loadRoute(name) {
  try {
    const file = new URL(`./routes/${name}.json`, import.meta.url);
    const pts = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(pts) && pts.length >= 2 && pts.every((p) => Array.isArray(p) && p.length === 2)) {
      return { points: pts, source: 'road-snapped' };
    }
    console.warn(`routes/${name}.json is not a [lat, lng][] array; using the coarse polyline`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`routes/${name}.json unreadable (${e.message}); using the coarse polyline`);
  }
  return { points: ROUTES[name], source: 'coarse fallback' };
}

// Real cafe on the Bengaluru-Mysuru expressway, used when Photon is unreachable (OSM node 378839909).
const FALLBACK_CAFE = { name: 'Coffee Day', address: 'Bengaluru-Mysuru Expressway, Gejjalagere', lat: 12.572028, lng: 77.0122051 };

// ------------------------------------------------------------------ geo helpers
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function haversine([la1, lo1], [la2, lo2]) {
  const dLa = rad(la2 - la1);
  const dLo = rad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearing([la1, lo1], [la2, lo2]) {
  const y = Math.sin(rad(lo2 - lo1)) * Math.cos(rad(la2));
  const x = Math.cos(rad(la1)) * Math.sin(rad(la2)) - Math.sin(rad(la1)) * Math.cos(rad(la2)) * Math.cos(rad(lo2 - lo1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

function buildRoute(points) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
  return { points, cum, length: cum[cum.length - 1] };
}

/** Position and segment bearing at `d` metres along the route (clamped). */
function positionAt(route, d) {
  const dist = Math.min(Math.max(d, 0), route.length);
  // Binary search for the first vertex at or beyond `dist` (the road route has ~1.5k vertices).
  let lo = 1;
  let hi = route.points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.cum[mid] < dist) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const a = route.points[i - 1];
  const b = route.points[i];
  const segLen = route.cum[i] - route.cum[i - 1] || 1;
  const f = (dist - route.cum[i - 1]) / segLen;
  return { lat: a[0] + (b[0] - a[0]) * f, lng: a[1] + (b[1] - a[1]) * f, heading: bearing(a, b) };
}

// ------------------------------------------------------------------ misc helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const inWindow = (t, start, len) => t >= start && t < start + len;
const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);
const errMsg = (e) => (e && (e.message || e.details || e.code)) || String(e);

// ------------------------------------------------------------------ args / env
function parseCli() {
  const { values } = parseArgs({
    options: {
      code: { type: 'string' },
      riders: { type: 'string', default: '4' },
      tick: { type: 'string', default: '5' },
      emulator: { type: 'string' },
      route: { type: 'string', default: 'mysuru' },
      duration: { type: 'string', default: '900' },
      propose: { type: 'string' },
    },
  });
  const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
  if (!values.code || !/^\d{6}$/.test(values.code)) die('--code <6-digit ride code> is required');
  if (!ROUTES[values.route]) die(`unknown --route "${values.route}" (known: ${Object.keys(ROUTES).join(', ')})`);
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) die('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing (use --env-file=.env)');
  const riders = Math.min(Math.max(parseInt(values.riders, 10) || 4, 1), CONFIG.maxRiders);
  return {
    code: values.code, riders, url, key, route: values.route, emulator: values.emulator,
    tick: Math.max(parseFloat(values.tick) || 5, 0.5),
    duration: parseFloat(values.duration) || 900,
    propose: values.propose === undefined ? null : Math.max(parseFloat(values.propose) || 0, 0),
  };
}

// ------------------------------------------------------------------ bots
function newBot(index, opts) {
  const scenario = CONFIG.scenarios[index] ?? { type: 'steady' };
  return {
    index,
    name: `${CONFIG.names[index]} (bot)`,
    scenario,
    client: createClient(opts.url, opts.key, { auth: { persistSession: false, autoRefreshToken: true } }),
    userId: null,
    dist: 0,
    heading: 0,
    kmh: 0,
    baseKmh: scenario.type === 'lagging' ? scenario.speedKmh : CONFIG.baseSpeedsKmh[index],
    state: 'init',
    queue: [],
    uploaded: 0,
    ticks: 0,
    flags: {},
    lastError: '',
  };
}

async function setupBot(bot, code) {
  const { data, error } = await bot.client.auth.signInAnonymously();
  if (error) throw new Error(`sign-in failed: ${errMsg(error)}`);
  bot.userId = data.user.id;
  log(`${bot.name}: signed in (${bot.userId.slice(0, 8)})`);

  const prof = await bot.client.from('profiles').upsert({ id: bot.userId, display_name: bot.name });
  if (prof.error) throw new Error(`profile upsert failed: ${errMsg(prof.error)}`);
  log(`${bot.name}: profile ok`);

  // The SOS bot saves emergency contacts so helpers' apps can show "Call <name>'s contacts".
  // +91 0… is not a dialable Indian number, so tapping "Call" in a test can never reach a real person.
  if (bot.scenario.type === 'sos') {
    const contacts = await bot.client.from('emergency_contacts').insert([
      { name: 'Lakshmi', phone: '+910000000001', relation: 'Mother', position: 0 },
      { name: 'Ambulance', phone: '108', relation: 'Ambulance', position: 1 },
    ]);
    log(`${bot.name}: emergency contacts ${contacts.error ? `failed: ${errMsg(contacts.error)}` : 'saved (2)'}`);
  }

  const join = await bot.client.rpc('join_ride', { p_code: code });
  if (join.error) throw new Error(`join_ride failed: ${errMsg(join.error)}`);
  log(`${bot.name}: joined ride "${join.data.name}" (${join.data.status})`);
  return join.data;
}

/** Decide this tick's speed / connectivity and fire scenario RPCs. t = null in the lobby. */
async function applyScenario(bot, t, rideId) {
  const s = bot.scenario;
  const plan = { kmh: bot.baseKmh, offline: false, state: 'cruise' };
  const rpc = async (flag, fn, args) => {
    if (bot.flags[flag]) return;
    const { error } = await bot.client.rpc(fn, args);
    if (error) { plan.err = `${fn}: ${errMsg(error)}`; return; } // movement plan still applies
    bot.flags[flag] = true; // only mark done on success so failures retry next tick
  };

  if (t === null) return { kmh: 0, offline: false, state: 'lobby' };

  if (s.type === 'fuel_stop') {
    if (inWindow(t, s.at, s.stopFor)) {
      plan.kmh = 0; plan.state = 'FUEL STOP';
      await rpc('fuel', 'send_ride_message', { p_ride_id: rideId, p_kind: 'fuel' });
    } else if (t >= s.at + s.stopFor && bot.flags.fuel) {
      await rpc('resume', 'send_ride_message', { p_ride_id: rideId, p_kind: 'all_good' });
    }
  } else if (s.type === 'tunnel') {
    if (inWindow(t, s.at, s.offlineFor)) { plan.offline = true; plan.state = 'TUNNEL (no upload)'; }
  } else if (s.type === 'sos') {
    if (inWindow(t, s.at, s.stopFor)) {
      plan.kmh = 0; plan.state = 'SOS';
      await rpc('sosOn', 'set_sos', { p_ride_id: rideId, p_on: true });
    } else if (t >= s.at + s.stopFor && bot.flags.sosOn) {
      await rpc('sosOff', 'set_sos', { p_ride_id: rideId, p_on: false });
    }
  } else if (s.type === 'lagging') {
    plan.state = 'lagging';
  }
  return plan;
}

function makeSample(bot, rideId, plan, lobby, routeLen, route, tick) {
  if (!lobby && plan.kmh > 0) bot.dist = Math.min(bot.dist + (plan.kmh / 3.6) * tick, routeLen);
  const atEnd = bot.dist >= routeLen;
  const pos = positionAt(route, bot.dist);
  const moving = !lobby && plan.kmh > 0 && !atEnd;
  if (moving) bot.heading = pos.heading;
  bot.kmh = moving ? plan.kmh : 0;
  let speed;
  if (lobby) speed = null; // unknown speed: avoids spurious server 'stopped' events while waiting
  else if (moving) speed = (plan.kmh / 3.6) * rand(0.95, 1.05);
  else speed = rand(0.2, 0.5);
  return {
    ride_id: rideId,
    recorded_at: new Date().toISOString(),
    lat: pos.lat,
    lng: pos.lng,
    accuracy_m: Math.round(rand(4, 8) * 10) / 10,
    speed_mps: speed,
    heading: bot.heading,
    app_state: 'background',
    battery: Math.max(0.05, Math.round((0.9 - bot.ticks * 0.0005) * 1000) / 1000),
  };
}

/** Upload the whole queue (oldest first) in one batch; keep it queued on failure. */
async function flushQueue(bot) {
  if (!bot.queue.length) return;
  const batch = bot.queue.slice();
  const { error } = await bot.client
    .from('ride_samples')
    .upsert(batch, { onConflict: 'ride_id,user_id,recorded_at', ignoreDuplicates: true });
  if (error) throw new Error(`upload: ${errMsg(error)}`);
  bot.queue.splice(0, batch.length);
  bot.uploaded += batch.length;
  if (batch.length > 2) log(`${bot.name}: uploaded backlog of ${batch.length} samples`);
}

async function tickBot(bot, ctx) {
  try {
    bot.ticks++;
    const lobby = ctx.activeAt === null;
    const t = lobby ? null : (Date.now() - ctx.activeAt) / 1000;
    let plan = { kmh: 0, offline: false, state: 'lobby' };
    plan = await applyScenario(bot, t, ctx.rideId);
    const scenarioErr = plan.err ?? '';
    bot.state = plan.state;
    bot.queue.push(makeSample(bot, ctx.rideId, plan, lobby, ctx.route.length, ctx.route, ctx.tick));
    if (!plan.offline) await flushQueue(bot);
    bot.lastError = scenarioErr; // reached only if the upload succeeded (or was skipped)
  } catch (e) {
    bot.lastError = errMsg(e);
  }
}

// ------------------------------------------------------------------ stop proposal
/** Nearest real cafe to `pos` from Photon (amenity:cafe, location-biased), or the fallback cafe. */
async function findCafeNear(pos) {
  try {
    const url = `https://photon.komoot.io/api/?q=cafe&lat=${pos.lat.toFixed(5)}&lon=${pos.lng.toFixed(5)}&limit=8&lang=en&osm_tag=amenity:cafe`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`Photon HTTP ${res.status}`);
    const found = ((await res.json()).features ?? [])
      .map((f) => {
        const p = f.properties ?? {};
        const [lng, lat] = f.geometry?.coordinates ?? [];
        return { name: p.name, address: [p.street, p.city].filter(Boolean).join(', '), lat, lng };
      })
      .filter((c) => c.name && Number.isFinite(c.lat) && Number.isFinite(c.lng))
      .sort((a, b) => haversine([pos.lat, pos.lng], [a.lat, a.lng]) - haversine([pos.lat, pos.lng], [b.lat, b.lng]));
    if (found.length) return found[0];
  } catch (e) {
    log(`Photon lookup failed (${errMsg(e)}); using the fallback cafe`);
  }
  return FALLBACK_CAFE;
}

/** Once, `opts.propose` seconds after the ride is active: Priya proposes a coffee break. */
async function maybePropose(bot, ctx, opts) {
  if (opts.propose === null || !bot || bot.flags.proposed || ctx.activeAt === null) return;
  if ((Date.now() - ctx.activeAt) / 1000 < opts.propose) return;
  bot.flags.proposed = true; // one attempt: the lookup is slow and a repeat would just supersede it
  const cafe = await findCafeNear(positionAt(ctx.route, bot.dist));
  const { data, error } = await bot.client.rpc('propose_stop', {
    p_ride_id: ctx.rideId,
    p_name: cafe.name,
    p_address: cafe.address ?? '',
    p_lat: cafe.lat,
    p_lng: cafe.lng,
    p_kind: 'break',
  });
  if (error) log(`${bot.name}: propose_stop failed: ${errMsg(error)}`);
  else log(`${bot.name}: proposed a break at "${cafe.name}" (${cafe.lat.toFixed(4)}, ${cafe.lng.toFixed(4)}) ${JSON.stringify(data)}`);
}

// ------------------------------------------------------------------ emulator
function startEmulator(opts, ctx) {
  const adb = `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
  const state = { dist: 0, last: Date.now(), lastSent: 0, warned: false, timer: null };
  // `emu geo fix <lng> <lat> [altitude [satellites [velocity (knots)]]]`: the console has no heading
  // argument, so the app derives the course from consecutive positions (lib/own-motion.ts).
  const send = (pos, kmh) => {
    const args = ['-s', opts.emulator, 'emu', 'geo', 'fix', String(pos.lng), String(pos.lat), '850', '10', (kmh / 1.852).toFixed(1)];
    execFile(adb, args, (err) => {
      if (err && !state.warned) { state.warned = true; log(`emulator: adb failed (${errMsg(err)})`); }
    });
  };
  state.timer = setInterval(() => {
    const now = Date.now();
    const dt = (now - state.last) / 1000;
    state.last = now;
    if (ctx.activeAt === null) {
      if (now - state.lastSent >= CONFIG.emulatorLobbyStepMs) { state.lastSent = now; send(positionAt(ctx.route, 0), 0); }
      return;
    }
    state.dist = Math.min(state.dist + (CONFIG.emulatorKmh / 3.6) * dt, ctx.route.length);
    send(positionAt(ctx.route, state.dist), CONFIG.emulatorKmh);
  }, CONFIG.emulatorStepMs);
  state.stop = () => clearInterval(state.timer);
  return state;
}

// ------------------------------------------------------------------ realtime
async function subscribeEvents(bot, rideId, names, seen) {
  await bot.client.realtime.setAuth();
  const channel = bot.client.channel(`ride:${rideId}`, { config: { private: true } });
  channel.on('broadcast', { event: 'event' }, (msg) => {
    // msg.payload is the ride_events row itself; row.payload is that event's own data column.
    const row = msg.payload ?? {};
    const who = names.get(row.user_id) ?? (row.user_id ? row.user_id.slice(0, 8) : 'system');
    const extra = row.payload && Object.keys(row.payload).length ? ` ${JSON.stringify(row.payload)}` : '';
    seen.push({ type: row.type, who });
    log(`EVENT <- ${row.type} by ${who}${extra}`);
  });
  channel.subscribe((status, err) => log(`channel ride:${rideId.slice(0, 8)} status: ${status}${err ? ` (${errMsg(err)})` : ''}`));
  return channel;
}

// ------------------------------------------------------------------ main
async function main() {
  const opts = parseCli();
  const loaded = loadRoute(opts.route);
  const route = buildRoute(loaded.points);
  log(`route "${opts.route}" (${loaded.source}): ${route.points.length} waypoints, ${(route.length / 1000).toFixed(1)} km`);

  const bots = [];
  for (let i = 0; i < opts.riders; i++) bots.push(newBot(i, opts));

  // Shared state read by the tick loop, status poller and emulator driver.
  const ctx = { rideId: null, activeAt: null, ended: false, route, tick: opts.tick };
  const names = new Map();
  const seen = [];
  let channel = null;
  let emulator = null;
  let stopping = false;
  let statusTimer = null;
  let wake = () => {};

  // Cleanup runs once (Ctrl-C, ended, duration).
  const shutdown = async (reason) => {
    if (stopping) return;
    stopping = true;
    log(`stopping: ${reason}`);
    wake();
  };
  process.on('SIGINT', () => shutdown('Ctrl-C'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 1. Bots sign in, create profile, join.
  let ride = null;
  try {
    for (const bot of bots) {
      ride = await setupBot(bot, opts.code);
      names.set(bot.userId, bot.name);
    }
  } catch (e) {
    console.error(`\nFATAL: ${errMsg(e)}`);
    if (/ride_not_found/.test(errMsg(e))) console.error('No open ride with that code (check the code / ride not ended).');
    await leaveAll(bots, ctx.rideId ?? ride?.id);
    process.exit(1);
  }
  ctx.rideId = ride.id;
  if (ride.status === 'active') ctx.activeAt = Date.now();
  log(`ride ${ride.id} status=${ride.status} stop_threshold_s=${ride.stop_threshold_s}`);
  const fuel = CONFIG.scenarios[0];
  if (fuel?.type === 'fuel_stop' && ride.stop_threshold_s > fuel.stopFor) {
    log(`WARNING: stop_threshold_s (${ride.stop_threshold_s}) > fuel stop (${fuel.stopFor}s): server 'stopped' will not fire`);
  }

  // Realtime listener on one bot (the last one, so it is not the fuel/tunnel/sos bot when possible).
  try {
    channel = await subscribeEvents(bots[bots.length - 1], ctx.rideId, names, seen);
  } catch (e) {
    log(`realtime subscribe failed: ${errMsg(e)}`);
  }

  // 2. Poll ride status.
  const pollStatus = async () => {
    const { data, error } = await bots[0].client.from('rides').select('status').eq('id', ctx.rideId).single();
    if (error) { log(`status poll error: ${errMsg(error)}`); return; }
    if (data.status === 'active' && ctx.activeAt === null) {
      ctx.activeAt = Date.now();
      log('ride is ACTIVE - riders rolling');
    } else if (data.status === 'ended') {
      ctx.ended = true;
      shutdown('ride ended');
    }
  };
  statusTimer = setInterval(() => { pollStatus().catch(() => {}); }, CONFIG.statusPollMs);
  if (ctx.activeAt === null) log('waiting for leader to start…');

  if (opts.emulator) {
    emulator = startEmulator(opts, ctx);
    log(`emulator ${opts.emulator}: driving leader GPS at ${CONFIG.emulatorKmh} km/h once active`);
  }

  // 3. Tick loop.
  while (!stopping) {
    const started = Date.now();
    await Promise.allSettled(bots.map((b) => tickBot(b, ctx)));
    await maybePropose(bots[1], ctx, opts).catch((e) => log(`propose error: ${errMsg(e)}`));
    printTable(bots, ctx);
    if (ctx.activeAt !== null && (Date.now() - ctx.activeAt) / 1000 >= opts.duration) {
      shutdown('duration elapsed');
      break;
    }
    const wait = Math.max(0, opts.tick * 1000 - (Date.now() - started));
    await new Promise((resolve) => { wake = resolve; setTimeout(resolve, wait); });
  }

  // 4. Teardown + summary.
  clearInterval(statusTimer);
  emulator?.stop();
  await leaveAll(bots, ctx.rideId);
  if (channel) await bots[bots.length - 1].client.removeChannel(channel).catch(() => {});
  printSummary(bots, seen);
  process.exit(0);
}

async function leaveAll(bots, rideId) {
  if (!rideId) return;
  await Promise.allSettled(bots.filter((b) => b.userId).map((b) => b.client.rpc('leave_ride', { p_ride_id: rideId })));
}

function printTable(bots, ctx) {
  const t = ctx.activeAt === null ? 'lobby' : `t=${Math.round((Date.now() - ctx.activeAt) / 1000)}s`;
  console.log(`--- ${ts()} ${t} ---`);
  for (const b of bots) {
    console.log(
      `${b.name.padEnd(15)} ${b.state.padEnd(19)} ${(b.dist / 1000).toFixed(2).padStart(6)} km ` +
        `${String(Math.round(b.kmh)).padStart(3)} km/h  up:${String(b.uploaded).padStart(4)} q:${String(b.queue.length).padStart(3)}` +
        `${b.lastError ? `  ERR ${b.lastError}` : ''}`,
    );
  }
}

function printSummary(bots, seen) {
  console.log('\n=== summary ===');
  for (const b of bots) console.log(`${b.name.padEnd(15)} samples sent: ${b.uploaded}, still queued: ${b.queue.length}`);
  const counts = {};
  for (const e of seen) counts[`${e.type}:${e.who}`] = (counts[`${e.type}:${e.who}`] ?? 0) + 1;
  console.log(`events seen on channel: ${seen.length}`);
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k} x${n}`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
