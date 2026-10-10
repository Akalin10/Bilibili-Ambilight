(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  const dayMs = 86400000;
  // 定时自检间隔：兼顾系统休眠、手动改系统时间等场景，代价可忽略。
  const maxDelay = 120000;
  let nextBoundary = null;
  let timer = null;
  // 手动覆盖状态。"有没有覆盖"与"覆盖成什么"必须分开记：
  // 否则"覆盖为浅色"会被当成"没有覆盖"，手动切浅色就会失效。
  const overridden = {active: false, dark: false, deadline: null};
  // 覆盖状态要写进 storage，否则弹窗一关，页面的内容脚本就按自动规则算了。
  const storage = globalThis.chrome?.storage;
  const storageKey = 'ambilightOverride';

  // 覆盖状态签名：区分"没有覆盖"与"覆盖为浅色"，用于只在变化时写入、并忽略自己写出
  // 去的回声。
  function signature(active, dark, deadline) {
    if (!active) return 'none';
    return dark ? `dark@${deadline ?? ''}` : 'light';
  }
  let currentSignature = signature(false, false, null);

  function storageGet(key) {
    return storage ? storage.local.get(key) : Promise.resolve({});
  }
  function storageSet(values) {
    return storage ? storage.local.set(values) : Promise.resolve();
  }

  // __ambilightNow 仅供开发校验脚本注入固定时钟，扩展运行时不存在。
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

  // 把"当地墙上时钟的分钟数"换算回时间戳，正确处理跨日与夏令时切换。
  function instantOf(date, minutes) {
    const target = ((minutes % 1440) + 1440) % 1440;
    const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    let instant = midnight + target * 60000;
    // 若该时刻的实际墙上时间与目标不符（夏令时切换、跨日），按差值修正。
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

  // 边界取整到分钟，保证状态栏显示的时刻与实际切换时刻一致。
  const toMinute = value => Math.round(value);

  // 统一算出"浅色时段"边界，日出日落与自定义时间两种模式共用后续逻辑。
  function state(date) {
    const preferences = app.preferences.value;
    const location = app.location.resolve(date);
    if (!location) return null;
    const times = app.solar?.sunTimes(location.latitude, location.longitude, date);
    if (!times) return null;
    if (preferences.mode !== 'time' && times.polar) {
      return {dark: times.polar === 'night', polar: times.polar, boundaries: [], times, location};
    }
    const lightFrom = preferences.mode === 'time' ? preferences.lightFromMinutes : toMinute(times.sunrise);
    const lightTo = preferences.mode === 'time' ? preferences.lightToMinutes : toMinute(times.sunset);
    if (!Number.isFinite(lightFrom) || !Number.isFinite(lightTo)) {
      return {dark: true, polar: 'night', boundaries: [], times, location};
    }
    // 起止相同表示整天同一状态，此时没有切换点。
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

  // 下一个"浅色 ↔ 深色"变化时刻；跨过当天最后一个边界时顺延到明天的日出/浅色起点。
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

  // 自动切换只取决于自动偏好本身；"启用环境光"总开关由 content.js 把关。
  function isAutoActive() {
    const preferences = app.preferences.value;
    return Boolean(preferences.auto && preferences.mode !== 'manual');
  }

  function clearOverride() {
    overridden.active = false;
    overridden.dark = false;
    overridden.deadline = null;
  }

  // 自动模式下的结果；返回 null 时表示应由手动开关决定。
  function getDark(date = currentDate()) {
    const dark = autoDark(date);
    if (dark === null) return null;
    return overridden.active ? overridden.dark : dark;
  }

  function status(date = currentDate()) {
    if (!isAutoActive()) return null;
    const current = autoState(date);
    if (!current) return {text: '读取不到位置信息，自动切换未生效', next: null};
    // 手动选择生效期间，"下次切换"就是它交还自动的时刻。
    const upcoming = nextSwitch(date);
    if (upcoming === null) return {text: `当前：${current.dark ? '深色' : '浅色'} · 今日无切换`, next: null};
    const dark = overridden.active ? overridden.dark : current.dark;
    return {text: `当前：${dark ? '深色' : '浅色'} · 下次切换 ${formatClock(new Date(upcoming))}`, next: upcoming};
  }

  // 依据当前时间重新判定；手动选择到点后自动交还给自动结果。
  function sync({force = false} = {}) {
    const date = currentDate();
    if (overridden.active) {
      // 手动选择始终优先，但不取消自动切换：
      // 失效时刻为 null 表示本时段没有切换点，此时一直有效。
      const expired = overridden.deadline !== null && overridden.deadline <= date.getTime();
      if (!isAutoActive() || expired) {
        clearOverride();
        persistOverride();
      }
    }
    nextBoundary = nextSwitch(date);
    app.themeSchedule.ready = true;
    // force 用于 storage 变化等外部来源，此时深浅可能已变，必须让内容脚本重新套用。
    if (force) document.dispatchEvent(new CustomEvent('ambilight-theme-change'));
  }

  // 把覆盖状态写入 storage，保证"弹窗设置 → 页面生效"跨上下文成立。
  // 只在签名变化时写入，且各上下文对同一签名不会重复回写，因此不会互相覆盖。
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

  // 从 storage 恢复覆盖状态（内容脚本启动、弹窗打开时调用）。
  function restore() {
    if (!storage) return Promise.resolve(false);
    return storageGet(storageKey).then(stored => applyStored(stored?.[storageKey])).catch(error => {
      console.warn('[Bilibili Ambilight] 手动覆盖状态读取失败。', error);
      return false;
    });
  }

  // 应用一条来自 storage 的覆盖记录；与自己已知状态相同则不做任何事（避免回声）。
  function applyStored(saved) {
    const record = saved && typeof saved === 'object' ? saved : null;
    // active 表示"是否处于手动覆盖"，dark 表示"覆盖成深色还是浅色"，两者必须分开。
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
    const wait = delay === null ? 60000 : Math.max(1000, Math.min(maxDelay, delay));
    timer = setTimeout(() => {
      sync();
      schedule(nextBoundary === null ? null : nextBoundary - now());
    }, wait);
  }

  function resolveLocation(date = currentDate()) {
    const stored = app.preferences.value.location;
    // 用户通过"获取位置"拿到的坐标优先；没有时退回系统时区估算。
    if (stored) {
      // city 仅用于界面提示，原样带出去。
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
    // 手动选择优先：立即生效，并在下一个自动切换点交还自动（不取消自动切换）。
    overrideDark(dark) {
      if (!isAutoActive()) return;
      overridden.active = true;
      overridden.dark = Boolean(dark);
      // 连点以最后一次为准：每次都重新对齐到"下一个切换点"。
      overridden.deadline = nextSwitch(currentDate());
      persistOverride();
      sync();
      schedule();
    },
    nextSwitch,
    status,
    formatClock,
    sync,
    restore,
  };

  // preferences 的订阅在 settings.js 中统一建立，这里只负责在偏好变化后重新判定。
  app.preferences.subscribe(() => {
    if (!app.themeSchedule.ready) return;
    sync();
    schedule();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      sync();
      schedule();
    }
  });
  window.addEventListener('pageshow', () => {
    sync();
    schedule();
  });
})();
