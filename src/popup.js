(function () {
  // 兜底：任何初始化异常都要让用户看得见，否则表现为"点不动、没数值"。
  const status=document.getElementById('status');
  const fail=error=>{
    if(status && !status.dataset.ready)status.textContent=`初始化失败：${error?.message || error}`;
    console.error('[Bilibili Ambilight] 设置界面初始化失败。',error);
  };
  try {
  'use strict';
  const app=globalThis.BilibiliAmbilight;
  const settings=app.settings;
  const preferences=app.preferences;
  const themeSchedule=app.themeSchedule;
  const locations=app.locations;
  // 元素缺失必须立刻报错，否则会静默变成"点不动"。
  function required(selector){
    const element=document.querySelector(selector);
    if(!element)throw new Error(`设置界面缺少元素 ${selector}`);
    return element;
  }
  const form=required('#settings');
  const preferenceForm=required('#preferences');
  const modePanel=required('#mode-panel');
  const sunFields=required('#sun-fields');
  const timeFields=required('#time-fields');
  const locateButton=required('#locate');
  const locationStatus=required('#location-status');
  const manualLocation=required('#manual-location');
  const autoStatus=required('#auto-status');
  const coordsInput=required('#coords');
  const coordsHint=required('#coords-hint');
  const autoDetails=required('#auto-details');
  // 自动切换面板里"元素 id → 偏好键"的映射。
  const preferenceKeys={'auto':'auto'};
  let queue=Promise.resolve();
  let revealed=false;
  // 定位进行中：用于禁用按钮，避免重复请求。
  let locating=false;

  function clock(minutes){
    const value=((Math.round(Number(minutes))%1440)+1440)%1440;
    return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
  }
  function clockToMinutes(text){
    const match=/^(\d{1,2}):(\d{1,2})$/.exec(String(text).trim());
    if(!match)return null;
    const hours=Number(match[1]), minutes=Number(match[2]);
    if(hours>23 || minutes>59)return null;
    return hours*60+minutes;
  }

  // 弹窗自身的深浅色跟随"实际生效"的主题，便于确认设置结果。
  function isLight(theme){
    if(theme==='actual'){
      const actual=themeSchedule.getDark();
      if(actual!==null)return actual!==true;
    }
    return settings.value.darkMode!==true;
  }
  function render(value,theme='manual'){
    for(const [key,current] of Object.entries(value)){
      const input=document.getElementById(key);
      if(!input)continue;
      if(typeof current==='boolean')input.checked=current;else input.value=current;
      const output=document.getElementById(`${key}-value`);
      if(output)output.value=key==='strength'?`${Math.round(current*100)}%`
        :key==='blur'?`${current.toFixed(1)}%`
        :key==='spread'?`${(current*100).toFixed(1)}%`
        :key==='fadeMs'?(current===0?'关闭':`${current} ms`)
        :key==='fpsLimit'?`${current} FPS`
        :`${current.toFixed(2)}×`;
      if(input.type==='range'){
        const progress=100*(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min));
        input.style.setProperty('--progress',`${progress}%`);
        input.setAttribute('aria-valuetext',output.value);
      }
    }
    document.documentElement.classList.toggle('ambilight-light',isLight(theme));
  }
  // 开关始终表示"当前实际是否深色"，与手动/自动无关：
  // 自动切换开启时改动它 = 以你的选择优先，保持到下一个切换时刻；关闭时就是普通偏好。
  function renderTheme(value={...settings.value}){
    if(themeSchedule.isAutoActive() && themeSchedule.getDark()!==null){
      value.darkMode=themeSchedule.getDark();
      render(value,'actual');
    }else render(value,'manual');
    applyState();
  }

  // 位置来源对应的说明文字。
  function locationAge(stored){
    if(!Number.isFinite(stored?.at))return '';
    const days=Math.floor((Date.now()-stored.at)/86400000);
    if(days<=0)return '（今天获取）';
    return days>=30?`（${days} 天前获取，建议重新获取）`:`（${days} 天前获取）`;
  }
  function showLocation(location){
    coordsHint.textContent='';
    if(!location){
      locationStatus.textContent='尚未获取位置：日出日落将按系统时区估算，可能有十几分钟误差。';
      return;
    }
    if(location.source==='zone'){
      // 估算值只用于提示，不填进手填框，避免把手填框当成本次生效值。
      const zone=location.zone?`系统时区 ${location.zone}，`:'';
      const accuracy=location.match==='offset'?'按标准时偏移粗估':'按时区代表城市估算';
      locationStatus.textContent=`尚未获取位置，${zone}${accuracy}（约 ${locations.formatCoordinates(location.latitude,location.longitude)}），可能有十几分钟误差；点上方按钮可获取更准确的位置。`;
      return;
    }
    coordsInput.value=locations.formatCoordinates(location.latitude,location.longitude);
    if(location.source==='geo'){
      locationStatus.textContent=`已使用浏览器定位${locationAge(location)}。`;
      return;
    }
    if(location.source==='ip'){
      const city=location.city?`（${location.city}附近）`:'';
      locationStatus.textContent=`已使用网络定位${city}${locationAge(location)}，精度到城市级。`;
      return;
    }
    // 手动坐标：提示固定写在手填框下方，避免被后续重渲染清掉。
    coordsHint.textContent='按此坐标计算。';
    locationStatus.textContent='已使用手动填写的坐标。';
  }
  // 浏览器定位：拿不到（未授权/超时/不支持）时返回 null，由调用方转 IP 定位。
  function requestGeolocation(timeoutMs=12000){
    return new Promise(resolve=>{
      if(typeof navigator==='undefined' || !navigator.geolocation){
        resolve(null);
        return;
      }
      let timer=null;
      const finish=position=>{
        if(timer!==null)clearTimeout(timer);
        if(!position)resolve(null);
        else resolve({latitude:position.coords.latitude, longitude:position.coords.longitude});
      };
      // 部分浏览器不会回调超时错误，这里自行兜底。
      timer=setTimeout(()=>finish(null),timeoutMs);
      try {
        navigator.geolocation.getCurrentPosition(finish,()=>finish(null),
          {enableHighAccuracy:false, timeout:timeoutMs, maximumAge:300000});
      } catch(error) {
        finish(null);
      }
    });
  }

  async function locate(){
    locateButton.disabled=true;
    const previous=locationStatus.textContent;
    locationStatus.textContent='正在获取位置…（可能会弹出浏览器的位置授权提示）';
    try {
      const geo=await requestGeolocation();
      if(geo){
        await preferences.set({location:{...geo, source:'geo', at:Date.now()}});
        renderPreferences();
        return;
      }
      locationStatus.textContent='浏览器定位不可用，改用网络定位…';
      const ip=await app.ipLocation.lookup();
      if(ip){
        await preferences.set({location:{latitude:ip.latitude, longitude:ip.longitude,
          source:'ip', city:ip.city||null, at:Date.now()}});
        renderPreferences();
        return;
      }
      locationStatus.textContent='获取位置失败：可以展开下方"手动填写坐标"，或继续沿用系统时区估算。';
      manualLocation.open=true;
    } catch(error) {
      locationStatus.textContent='获取位置失败：可以展开下方"手动填写坐标"，或继续沿用系统时区估算。';
      manualLocation.open=true;
      console.info('[Bilibili Ambilight] 获取位置失败。',error);
      if(!previous)console.debug(error);
    } finally {
      locateButton.disabled=false;
    }
  }

  // 模式只有"日出日落"和"自定义时间"两种；mode 为 manual 表示用户关掉了自动切换。
  function currentMode(){
    return preferences.value.mode==='time'?'time':'sun';
  }
  function applyState(){
    const value=preferences.value;
    const auto=value.auto;
    const mode=currentMode();
    modePanel.hidden=!auto;
    sunFields.hidden=!auto || mode!=='sun';
    timeFields.hidden=!auto || mode!=='time';
    for(const field of preferenceForm.querySelectorAll('input:not(#auto)'))field.disabled=!auto;
    locateButton.disabled=!auto || locating;
    // 折叠面板的开合交给用户（以及下面的展开按钮），不跟随 auto 变化，
    // 否则"启用自动切换"一点下去整个面板就收起，看起来像功能被关掉了。
    if(!auto)autoStatus.textContent='未启用自动切换：深浅只由上方开关决定，不会随时间变化。';
    else autoStatus.textContent=themeSchedule.status()?.text || '…';
  }

  function renderPreferences(){
    const value=preferences.value;
    required('#auto').checked=value.auto;
    document.querySelector(`input[name="mode"][value="${currentMode()}"]`).checked=true;
    required('#light-from').value=clock(value.lightFromMinutes);
    required('#light-to').value=clock(value.lightToMinutes);
    // 传入解析结果：没有保存过位置时显示系统时区估算的提示。
    showLocation(app.location.resolve());
    applyState();
  }

  // 立即把偏好写进 storage：不经过队列，避免弹窗在你松手后马上关闭时丢掉这次改动。
  const pendingWrites=new Map();
  function writeThrough(key, patch){
    const storage=globalThis.chrome?.storage?.local;
    const merged={...(pendingWrites.get(key) ?? (key==='ambilightPreferences'?preferences.value:settings.value)), ...patch};
    pendingWrites.set(key, merged);
    if(!storage)return;
    // 写入顺序由 chrome.storage 自己保证；这里只关心"尽早发出"。
    storage.set({[key]:merged}).then(()=>{
      if(pendingWrites.get(key)===merged)pendingWrites.delete(key);
    }).catch(error=>{
      console.warn('[Bilibili Ambilight] 设置写入失败。',error);
    });
  }

  function save(patch){
    writeThrough('ambilightSettings',patch);
    status.textContent='正在保存…';
    queue=queue.then(async()=>{
      await settings.set(patch);
      renderTheme();
      status.textContent='已保存';
    }).catch(()=>{status.textContent='保存失败，请重试';});
  }
  function savePreferences(patch){
    writeThrough('ambilightPreferences',patch);
    status.textContent='正在保存…';
    queue=queue.then(async()=>{
      await preferences.set(patch);
      renderPreferences();
      renderTheme();
      status.textContent='已保存';
    }).catch(()=>{status.textContent='保存失败，请重试';});
  }

  for(const target of [form,preferenceForm])target.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('change',event=>{
    const input=event.target;
    if(!Object.hasOwn(settings.defaults,input.id))return;
    const value=input.type==='checkbox'?input.checked:input.id==='quality'?input.value:Number(input.value);
    if(!Number.isFinite(value) && input.type!=='checkbox' && input.id!=='quality')return;
    save({[input.id]:value});
  });
  form.addEventListener('input',event=>{
    const input=event.target;
    if(input.type==='range')save({[input.id]:Number(input.value)});
  });
  preferenceForm.addEventListener('change',event=>{
    const input=event.target;
    if(input.name==='mode'){savePreferences({mode:input.value});return;}
    if(input.id==='light-from' || input.id==='light-to'){
      const minutes=clockToMinutes(input.value);
      if(minutes===null){status.textContent='时间格式应为 HH:MM';return;}
      savePreferences({[input.id==='light-from'?'lightFromMinutes':'lightToMinutes']:minutes});
      return;
    }
    // 元素 id 与偏好键并非一一对应，这里显式映射，避免改动 id 后静默失效。
    const key=preferenceKeys[input.id];
    if(!key)return;
    const value=input.type==='checkbox'?input.checked:input.value;
    if(key==='auto' && value===true){
      // 启用后保持面板展开，方便继续设置。
      autoDetails.open=true;
      // 还没选过模式时默认用日出日落，避免"开了却没在切"。
      if(preferences.value.mode==='manual'){
        savePreferences({auto:true,mode:'sun'});
        return;
      }
    }
    savePreferences({[key]:value});
  });
  locateButton.addEventListener('click',()=>{locating=true;applyState();locate().finally(()=>{locating=false;applyState();});});
  coordsInput.addEventListener('input',()=>{
    const point=locations.parseCoordinates(coordsInput.value);
    coordsHint.textContent=point?'按此坐标计算，失焦后保存。':'格式示例：31.23, 121.47（纬度, 经度）';
  });
  coordsInput.addEventListener('change',()=>{
    const point=locations.parseCoordinates(coordsInput.value);
    if(!point){
      coordsHint.textContent='格式示例：31.23, 121.47（纬度, 经度）';
      return;
    }
    coordsHint.textContent='按此坐标计算。';
    savePreferences({location:{...point, source:'manual', at:Date.now()}});
  });
  // 手动开关：自动模式下以你的选择优先，保持到下一个切换时刻后交还自动。
  const darkToggle=required('#darkMode');
  darkToggle.addEventListener('click',()=>{
    if(!themeSchedule.isAutoActive())return;
    // 浏览器会在 click 之前把 checked 翻转，因此不能读 checked，
    // 只能按"当前实际显示的主题"取反，否则会算出与当前相同的值、看起来没反应。
    const dark=themeSchedule.getDark()!==true;
    themeSchedule.overrideDark(dark);
    darkToggle.checked=dark;
    renderTheme();
    renderPreferences();
  });
  required('#reset').addEventListener('click',()=>{
    save(settings.defaults);
    savePreferences(preferences.defaults);
  });

  settings.subscribe(()=>renderTheme());
  document.addEventListener('ambilight-theme-change',()=>renderTheme());
  // 弹窗被关闭前把尚未落盘的改动补写一次（writeThrough 出错时的保底）。
  window.addEventListener('pagehide',()=>{
    for(const [key,value] of pendingWrites)globalThis.chrome?.storage?.local?.set({[key]:value});
    pendingWrites.clear();
  });
  // 弹窗打开期间跨过切换时刻时，状态栏与预览自动刷新。
  setInterval(()=>{
    if(document.hidden)return;
    renderTheme();
  },20000);

  // 万一 settings.ready 因存储异常迟迟不落地，这里也要解开 inert，避免弹窗永久无响应。
  function reveal(){
    if(revealed)return;
    revealed=true;
    clearInterval(revealTimer);
    try {
      renderTheme();
      renderPreferences();
      status.textContent='';
    } catch(error) {
      fail(error);
      status.dataset.ready='true';
    } finally {
      form.inert=false;
      preferenceForm.inert=false;
    }
    // 覆盖状态存在 storage 里：弹窗重新打开时要恢复它，否则开关显示与实际页面不一致。
    themeSchedule.restore?.().then(restored=>{
      if(!restored)return;
      renderTheme();
      renderPreferences();
    });
  }
  const revealTimer=setInterval(reveal,3000);
  settings.ready.then(reveal);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reveal);
  else reveal();
  } catch(error) {
    // 元素缺失等初始化异常：同样要解开 inert，否则弹窗完全无响应。
    fail(error);
    if(status)status.dataset.ready='true';
    document.querySelector('#settings')?.removeAttribute('inert');
    document.querySelector('#preferences')?.removeAttribute('inert');
  }
})();
