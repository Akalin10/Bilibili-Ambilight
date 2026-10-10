(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  // 读不到 manifest 时用当前版本兜底；发版时与 manifest.json 一起改。
  const version = globalThis.chrome?.runtime?.getManifest?.().version || '1.0.4';

  // 深色为可选项：darkMode 默认 false，即首次安装为浅色界面。
  const defaults = Object.freeze({ enabled:true, darkMode:false, strength:0.55, blur:42, spread:1.2,
    saturation:1.2, brightness:1.08, fadeMs:90, quality:'auto', fpsLimit:60 });
  const limits = { strength:[0,1], blur:[0,100], spread:[0,4], saturation:[0,2],
    brightness:[0.3,2], fadeMs:[0,400], fpsLimit:[10,60] };
  const modeValues = ['manual','sun','time'];
  function normalize(input={}) {
    input=input && typeof input==='object' ? input : {};
    const result={...defaults};
    result.enabled=typeof input.enabled==='boolean' ? input.enabled : defaults.enabled;
    // 旧版本只有 lightMode（默认深色）。已保存的偏好按原样沿用，不做强制翻转。
    result.darkMode=typeof input.darkMode==='boolean' ? input.darkMode
      : typeof input.lightMode==='boolean' ? !input.lightMode : defaults.darkMode;
    result.quality=['auto','low','medium','high'].includes(input.quality) ? input.quality : defaults.quality;
    for(const [key,[min,max]] of Object.entries(limits)) {
      const n=input[key];
      result[key]=typeof n==='number' && Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : defaults[key];
    }
    return result;
  }

  const autoDefaults = Object.freeze({ auto:false, mode:'manual',
    location:null, lightFromMinutes:420, lightToMinutes:1140 });
  const locationSourceValues = ['geo','ip','manual'];
  // 注意：Number(null) === 0，不能直接用它判断坐标，否则未设置会被当成合法的 0,0。
  function finiteNumber(input) {
    if(typeof input==='number')return Number.isFinite(input)?input:null;
    if(typeof input!=='string' || !input.trim())return null;
    const value=Number(input);
    return Number.isFinite(value)?value:null;
  }
  function minuteOfDay(value, fallback) {
    const minutes=finiteNumber(value);
    if(minutes===null)return fallback;
    return Math.round(Math.min(1439,Math.max(0,minutes)));
  }
  function coordinate(value, limit) {
    const number=finiteNumber(value);
    if(number===null || Math.abs(number)>limit)return null;
    return number;
  }
  // 位置只有"有/没有"两种状态；来源（浏览器定位 / IP 定位 / 手填）与城市名仅用于界面提示。
  function normalizeLocation(input) {
    const raw=input && typeof input==='object' ? input : {};
    const latitude=coordinate(raw.latitude,90), longitude=coordinate(raw.longitude,180);
    if(latitude===null || longitude===null)return null;
    const at=finiteNumber(raw.at);
    return {
      latitude, longitude,
      source:locationSourceValues.includes(raw.source)?raw.source:'manual',
      city:typeof raw.city==='string'&&raw.city?raw.city:null,
      at:at===null?null:Math.round(at),
    };
  }
  function normalizePreferences(input={}) {
    const raw=input && typeof input==='object' ? input : {};
    let location=normalizeLocation(raw.location);
    // 兼容早期版本把坐标摊在顶层的形式。
    if(!location)location=normalizeLocation({latitude:raw.latitude, longitude:raw.longitude,
      source:'manual', at:raw.at});
    return {
      auto:raw.auto===true,
      mode:modeValues.includes(raw.mode)?raw.mode:autoDefaults.mode,
      location,
      // 兼容早期草稿里的 lightFrom / lightTo 命名。
      lightFromMinutes:minuteOfDay(raw.lightFromMinutes ?? raw.lightFrom, autoDefaults.lightFromMinutes),
      lightToMinutes:minuteOfDay(raw.lightToMinutes ?? raw.lightTo, autoDefaults.lightToMinutes),
    };
  }

  function store(key, defaults, normalize, seed) {
    const storage=globalThis.chrome?.storage;
    const listeners=new Set();
    let value=normalize(seed);
    let changedDuringLoad=false;
    storage?.onChanged.addListener((changes,area) => {
      if(area==='local' && changes[key]) {
        changedDuringLoad=true; publish(changes[key].newValue);
      }
    });
    function publish(next) {
      const normalized=normalize(next);
      if(Object.keys(normalized).every(name=>normalized[name]===value[name]))return;
      value=normalized;for(const listener of listeners)listener(value);
    }
    return {
      defaults, normalize, key,
      get value(){return value;},
      subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
      async ready(){
        if(!storage)return;
        try {
          const saved=await storage.local.get(key);
          if(!changedDuringLoad)publish(saved[key]);
        } catch(error){console.warn('[Bilibili Ambilight] 设置读取失败，使用默认值。',error);}
      },
      async set(patch){
        const next=normalize({...value,...patch});
        const changed=Object.keys(next).some(name=>next[name]!==value[name]);
        if(storage)await storage.local.set({[key]:next});
        publish(next);
        return changed;
      },
    };
  }

  const settings=store('ambilightSettings', defaults, normalize);
  const preferences=store('ambilightPreferences', autoDefaults, normalizePreferences);
  // 注意：不要写成 {...settings}，展开会把 value 取值器固化成一次性快照。
  function expose(name, source) {
    const target={...source};
    delete target.value;
    Object.defineProperty(target,'value',{enumerable:true,get:()=>source.value});
    app[name]=target;
  }
  app.version=version;
  expose('settings', settings);
  expose('preferences', preferences);
  app.settings.ready=settings.ready();
  app.preferences.ready=preferences.ready();
})();
