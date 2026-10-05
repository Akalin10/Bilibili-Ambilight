(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  const defaults = Object.freeze({ enabled:true, strength:0.55, blur:42, spread:1.2,
    saturation:1.2, brightness:1.08, fadeMs:90, quality:'auto', fpsLimit:60 });
  const limits = { strength:[0,1], blur:[0,100], spread:[0,4], saturation:[0,2],
    brightness:[0.3,2], fadeMs:[0,400], fpsLimit:[10,60] };
  const listeners=new Set();
  let value={...defaults};
  function normalize(input={}) {
    input=input && typeof input==='object' ? input : {};
    const result={...defaults};
    result.enabled=typeof input.enabled==='boolean' ? input.enabled : defaults.enabled;
    result.quality=['auto','low','medium','high'].includes(input.quality) ? input.quality : defaults.quality;
    for(const [key,[min,max]] of Object.entries(limits)) {
      const n=input[key];
      result[key]=typeof n==='number' && Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : defaults[key];
    }
    return result;
  }
  function publish(next) {
    const normalized=normalize(next);
    if(Object.keys(normalized).every(key=>normalized[key]===value[key]))return;
    value=normalized;for(const listener of listeners)listener(value);
  }
  const storage=globalThis.chrome?.storage;
  let changedDuringLoad=false;
  storage?.onChanged.addListener((changes,area) => {
    if(area==='local' && changes.ambilightSettings) {
      changedDuringLoad=true; publish(changes.ambilightSettings.newValue);
    }
  });
  app.settings={ defaults,normalize,
    get value(){return value;},
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    ready:(async()=>{
      if(!storage)return;
      try {const saved=await storage.local.get('ambilightSettings');if(!changedDuringLoad)publish(saved.ambilightSettings);}
      catch(error){console.warn('[Bilibili Ambilight] 设置读取失败，使用默认值。',error);}
    })(),
    async update(patch){
      const next=normalize({...value,...patch});
      if(storage)await storage.local.set({ambilightSettings:next});
      publish(next);
    },
  };
})();
