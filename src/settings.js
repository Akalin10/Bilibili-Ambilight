(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  const defaults = Object.freeze({ enabled:true, lightMode:false, strength:0.55, blur:42, spread:1.2,
    saturation:1.2, brightness:1.08, fadeMs:90, quality:'auto', fpsLimit:60 });
  const limits = { strength:[0,1], blur:[0,100], spread:[0,4], saturation:[0,2],
    brightness:[0.3,2], fadeMs:[0,400], fpsLimit:[10,60] };
  const listeners=new Set();
  let value={...defaults};
  function normalize(input={}) {
    input=input && typeof input==='object' ? input : {};
    const result={...defaults};
    result.enabled=typeof input.enabled==='boolean' ? input.enabled : defaults.enabled;
    result.lightMode=typeof input.lightMode==='boolean' ? input.lightMode : defaults.lightMode;
    result.quality=['auto','low','medium','high'].includes(input.quality) ? input.quality : defaults.quality;
    for(const [key,[min,max]] of Object.entries(limits)) {
      const n=input[key];
      result[key]=typeof n==='number' && Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : defaults[key];
    }
    return result;
  }
  // 亮色模式：背景板换成白色，设置弹窗也跟着变白（其余网站 UI 保持暗色模式原样）。
  // 类挂在 <html> 与 <body> 上：ambilight.css 用它覆盖 --ambilight-backdrop 与
  // B 站的 --bg1，popup.css 用它把设置弹窗切成白色。
  function syncTheme(settings=value) {
    const light=settings.lightMode===true;
    document.documentElement?.classList.toggle('ambilight-light',light);
    document.body?.classList.toggle('ambilight-light',light);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',light?'light':'dark');
  }
  function publish(next) {
    const normalized=normalize(next);
    if(Object.keys(normalized).every(key=>normalized[key]===value[key]))return;
    value=normalized;syncTheme(value);for(const listener of listeners)listener(value);
  }
  const storage=globalThis.chrome?.storage;
  let changedDuringLoad=false;
  storage?.onChanged.addListener((changes,area) => {
    if(area==='local' && changes.ambilightSettings) {
      changedDuringLoad=true; publish(changes.ambilightSettings.newValue);
    }
  });
  app.settings={ defaults,normalize,syncTheme,
    get value(){return value;},
    subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    ready:(async()=>{
      if(!storage)return;
      try {const saved=await storage.local.get('ambilightSettings');if(!changedDuringLoad)publish(saved.ambilightSettings);}
      catch(error){console.warn('[Bilibili Ambilight] 设置读取失败，使用默认值。',error);}
      finally{syncTheme();}
    })(),
    async update(patch){
      const next=normalize({...value,...patch});
      if(storage)await storage.local.set({ambilightSettings:next});
      publish(next);
    },
  };
})();
