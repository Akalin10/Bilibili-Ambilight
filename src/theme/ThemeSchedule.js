(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  const dayMs = 86400000;
  const maxDelay = 120000;
  let nextBoundary = null;
  let timer = null;
  let lastDark;
  let suspended = false;
  const overridden = {active: false, dark: false, deadline: null};
  const storage = globalThis.chrome?.storage;
  const storageKey = 'ambilightOverride';
  function signature(active, dark, deadline) {
    if (!active) return 'none';
    return `${dark ? 'dark' : 'light'}@${deadline ?? ''}`;
  }
  let currentSignature = signature(false, false, null);

  function storageGet(key) {
    return storage ? storage.local.get(key) : Promise.resolve({});
  }
  function storageSet(values) {
    return storage ? storage.local.set(values) : Promise.resolve();
  }
  function now() {
    const injected = globalThis.__ambilightNow;
    return Number.isFinite(injected) ? injected : Date.now();
  }
  function currentDate() {
    return new Date(now());
  }

  function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  }
  function instantOf(date, minutes) {
    const target = ((minutes % 1440) + 1440) % 1440;
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    let instant = midnight + target * 60000;
    for (let attempt = 0; attempt < 3; attempt++) {
      const diff = target - minutesOfDay(new Date(instant));
      if (Math.abs(diff) < 0.5) break;
      instant += diff * 60000;
    }
    return instant;
  }

  function inDarkWindow(nowMinutes, lightFrom, lightTo) {
    const from = ((lightFrom % 1440) + 1440) % 1440;
    const to = ((lightTo % 1440) + 1440) % 1440;
    if (from === to) return true;
    const light = from <= to ? nowMinutes >= from && nowMinutes < to : nowMinutes >= from || nowMinutes < to;
    return !light;
  }
  const toMinute = value => Math.round(value);
  function state(date) {
    const preferences = app.preferences.value;
    const location = preferences.mode === 'time' ? null : app.location.resolve(date);
    const times = preferences.mode === 'time' ? {} : location && app.solar?.sunTimes(location.latitude, location.longitude, date);
    if (!times) return null;
    if (preferences.mode !== 'time' && times.polar) {
      return {dark: times.polar === 'night', polar: times.polar, boundaries: [], times, location};
    }
    const lightFrom = preferences.mode === 'time' ? preferences.lightFromMinutes : toMinute(times.sunrise);
    const lightTo = preferences.mode === 'time' ? preferences.lightToMinutes : toMinute(times.sunset);
    if (!Number.isFinite(lightFrom) || !Number.isFinite(lightTo)) {
      return {dark: true, polar: 'night', boundaries: [], times, location};
    }
    const boundaries = lightFrom === lightTo ? [] : [lightFrom, lightTo].sort((a, b) => a - b);
    return {
      dark: inDarkWindow(minutesOfDay(date), lightFrom, lightTo),
      polar: null,
      boundaries,
      times,
      location,
    };
  }

  function autoState(date = currentDate()) {
    const preferences = app.preferences.value;
    if (!preferences.auto || preferences.mode === 'manual') return null;
    return state(date);
  }

  function autoDark(date = currentDate()) {
    const current = autoState(date);
    return current ? current.dark : null;
  }
  function nextSwitch(date = currentDate()) {
    const current = autoState(date);
    if (!current || !current.boundaries.length) return null;
    const minutes = minutesOfDay(date);
    for (const boundary of current.boundaries) {
      if (boundary > minutes) return instantOf(date, boundary);
    }
    const tomorrow = new Date(date.getTime() + dayMs);
    const tomorrowState = state(tomorrow);
    if (!tomorrowState || !tomorrowState.boundaries.length) return null;
    return instantOf(tomorrow, tomorrowState.boundaries[0]);
  }

  function formatClock(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  function isAutoActive() {
    const preferences = app.preferences.value;
    return Boolean(preferences.auto && preferences.mode !== 'manual');
  }

  function clearOverride() {
    overridden.active = false;
    overridden.dark = false;
    overridden.deadline = null;
  }
  function getDark(date = currentDate()) {
    const dark = autoDark(date);
    if (dark === null) return null;
    return overridden.active ? overridden.dark : dark;
  }

  function status(date = currentDate()) {
    if (!isAutoActive()) return null;
    const current = autoState(date);
    if (!current) return {text: '读取不到位置信息，自动切换未生效', next: null};
    const upcoming = nextSwitch(date);
    if (upcoming === null) return {text: `当前：${current.dark ? '深色' : '浅色'} · 今日无切换`, next: null};
    const dark = overridden.active ? overridden.dark : current.dark;
    return {text: `当前：${dark ? '深色' : '浅色'} · 下次切换 ${formatClock(new Date(upcoming))}`, next: upcoming};
  }
  function sync({force = false} = {}) {
    const date = currentDate();
    if (overridden.active) {
      const expired = overridden.deadline !== null && overridden.deadline <= date.getTime();
      if (!isAutoActive() || expired) {
        clearOverride();
        persistOverride();
      }
    }
    nextBoundary = nextSwitch(date);
    const dark = getDark(date);
    const changed = dark !== lastDark;
    lastDark = dark;
    app.themeSchedule.ready = true;
    if (force || changed) document.dispatchEvent(new CustomEvent('ambilight-theme-change'));
  }
  function persistOverride() {
    const next = signature(overridden.active, overridden.dark, overridden.deadline);
    if (next === currentSignature) return Promise.resolve();
    currentSignature = next;
    return storageSet({[storageKey]: {
      active: overridden.active,
      dark: overridden.dark,
      deadline: overridden.active ? overridden.deadline : null,
      at: now(),
    }});
  }
  function restore() {
    if (!storage) return Promise.resolve(false);
    return storageGet(storageKey).then(stored => applyStored(stored?.[storageKey])).catch(error => {
      console.warn('[Bilibili Ambilight] 手动覆盖状态读取失败。', error);
      return false;
    });
  }
  function applyStored(saved) {
    const record = saved && typeof saved === 'object' ? saved : null;
    const active = record?.active === true;
    const dark = active && record.dark === true;
    const deadline = active && Number.isFinite(record.deadline) ? record.deadline : null;
    const next = signature(active, dark, deadline);
    if (next === currentSignature) return false;
    currentSignature = next;
    overridden.active = active;
    overridden.dark = dark;
    overridden.deadline = deadline;
    sync({force: true});
    return active;
  }

  if (storage?.onChanged?.addListener) {
    storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[storageKey]) return;
      applyStored(changes[storageKey].newValue);
    });
  }

  function schedule(delay = null) {
    clearTimeout(timer);
    if (suspended) return;
    const wait = delay === null ? 60000 : Math.max(1000, Math.min(maxDelay, delay));
    timer = setTimeout(() => {
      sync();
      schedule(nextBoundary === null ? null : nextBoundary - now());
    }, wait);
  }

  function resolveLocation(date = currentDate()) {
    const stored = app.preferences.value.location;
    if (stored) {
      return {latitude: stored.latitude, longitude: stored.longitude,
        source: stored.source, city: stored.city ?? null, at: stored.at, zone: app.locations.systemZone()};
    }
    const zone = app.locations.systemZone();
    const estimate = app.locations.zoneCoordinates(zone);
    if (!estimate) return null;
    return {latitude: estimate.latitude, longitude: estimate.longitude,
      source: 'zone', zone, match: estimate.match};
  }

  app.location = {resolve: resolveLocation};

  app.themeSchedule = {
    ready: false,
    getDark,
    autoDark,
    isAutoActive,
    isOverridden: () => overridden.active,
    overrideDark(dark) {
      if (!isAutoActive()) return;
      overridden.active = true;
      overridden.dark = Boolean(dark);
      overridden.deadline = nextSwitch(currentDate());
      persistOverride();
      sync();
      schedule(nextBoundary === null ? null : nextBoundary - now());
    },
    nextSwitch,
    status,
    formatClock,
    sync,
    restore,
  };
  app.preferences.subscribe(() => {
    if (!app.themeSchedule.ready) return;
    sync();
    schedule(nextBoundary === null ? null : nextBoundary - now());
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      sync();
      schedule(nextBoundary === null ? null : nextBoundary - now());
    }
  });
  window.addEventListener('pagehide', () => {suspended = true; clearTimeout(timer);});
  window.addEventListener('pageshow', () => {
    suspended = false;
    sync();
    schedule(nextBoundary === null ? null : nextBoundary - now());
  });
  Promise.all([app.settings.ready, app.preferences.ready]).then(async () => {
    await restore();
    sync({force:true});
    schedule(nextBoundary === null ? null : nextBoundary - now());
  });
})();
