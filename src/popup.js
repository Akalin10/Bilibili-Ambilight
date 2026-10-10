(function () {
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
  const ipButton=required('#locate-ip');
  const manualLocation=required('#manual-location');
  const autoStatus=required('#auto-status');
  const coordsInput=required('#coords');
  const coordsHint=required('#coords-hint');
  const autoDetails=required('#auto-details');
  const preferenceKeys={'auto':'auto'};
  let queue=Promise.resolve();
  let revealed=false;
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
  function renderTheme(value={...settings.value}){
    if(themeSchedule.isAutoActive() && themeSchedule.getDark()!==null){
      value.darkMode=themeSchedule.getDark();
      render(value,'actual');
    }else render(value,'manual');
    applyState();
  }
  function locationAge(stored){
    if(!Number.isFinite(stored?.at))return '';
    const days=Math.floor((Date.now()-stored.at)/86400000);
    if(days<=0)return '（今天获取）';
    return days>=30?`（${days} 天前获取）`:`（${days} 天前获取）`;
  }
  function showLocation(location){
    coordsHint.textContent='';
    if(!location){
      locationStatus.textContent='使用系统时区估算';
      return;
    }
    if(location.source==='zone'){
      const zone=location.zone?`系统时区 ${location.zone}，`:'';
      const accuracy=location.match==='offset'?'按标准时偏移粗估':'按时区代表城市估算';
      locationStatus.textContent=`尚未获取位置，${zone}${accuracy}（约 ${locations.formatCoordinates(location.latitude,location.longitude)}）。`;
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
    coordsHint.textContent='按此坐标计算。';
    locationStatus.textContent='已使用手动填写的坐标。';
  }
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
      timer=setTimeout(()=>finish(null),timeoutMs);
      try {
        navigator.geolocation.getCurrentPosition(finish,()=>finish(null),
          {enableHighAccuracy:false, timeout:timeoutMs, maximumAge:300000});
      } catch(error) {
        finish(null);
      }
    });
  }

  async function locate(useIP=false){
    locateButton.disabled=true;
    const previous=locationStatus.textContent;
    locationStatus.textContent='正在获取位置…';
    try {
      const geo=useIP?null:await requestGeolocation();
      if(geo){
        await preferences.set({location:{...geo, source:'geo', at:Date.now()}});
        renderPreferences();
        return;
      }
      if(!useIP){locationStatus.textContent='浏览器定位不可用';manualLocation.open=true;return;}
      locationStatus.textContent='正在进行 IP 定位…';
      const ip=await app.ipLocation.lookup();
      if(ip){
        await preferences.set({location:{latitude:ip.latitude, longitude:ip.longitude,
          source:'ip', city:ip.city||null, at:Date.now()}});
        renderPreferences();
        return;
      }
      locationStatus.textContent='定位失败，可手动填写坐标';
      manualLocation.open=true;
    } catch(error) {
      locationStatus.textContent='定位失败，可手动填写坐标';
      manualLocation.open=true;
      console.info('[Bilibili Ambilight] 获取位置失败。',error);
      if(!previous)console.debug(error);
    } finally {
      locateButton.disabled=false;
    }
  }
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
    ipButton.disabled=!auto || locating;
    if(!auto)autoStatus.textContent='自动切换已关闭';
    else autoStatus.textContent=themeSchedule.status()?.text || '…';
  }

  function renderPreferences(){
    const value=preferences.value;
    required('#auto').checked=value.auto;
    document.querySelector(`input[name="mode"][value="${currentMode()}"]`).checked=true;
    required('#light-from').value=clock(value.lightFromMinutes);
    required('#light-to').value=clock(value.lightToMinutes);
    showLocation(app.location.resolve());
    applyState();
  }
  function save(patch){
    status.textContent='正在保存…';
    queue=queue.then(async()=>{
      await settings.set(patch);
      renderTheme();
      status.textContent='已保存';
    }).catch(()=>{status.textContent='保存失败，请重试';});
  }
  function savePreferences(patch){
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
    if(input.id==='darkMode' && themeSchedule.isAutoActive())return;
    const value=input.type==='checkbox'?input.checked:input.id==='quality'?input.value:Number(input.value);
    if(!Number.isFinite(value) && input.type!=='checkbox' && input.id!=='quality')return;
    save({[input.id]:value});
  });
  form.addEventListener('input',event=>{
    const input=event.target;
    if(input.type==='range'){
      const patch={[input.id]:Number(input.value)};
      render({...settings.value,...patch},'actual');
      save(patch);
    }
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
    const key=preferenceKeys[input.id];
    if(!key)return;
    const value=input.type==='checkbox'?input.checked:input.value;
    if(key==='auto' && value===true){
      autoDetails.open=true;
      if(preferences.value.mode==='manual'){
        savePreferences({auto:true,mode:'sun'});
        return;
      }
    }
    savePreferences({[key]:value});
  });
  locateButton.addEventListener('click',()=>{locating=true;applyState();locate().finally(()=>{locating=false;applyState();});});
  ipButton.addEventListener('click',()=>{locating=true;applyState();locate(true).finally(()=>{locating=false;applyState();});});
  coordsInput.addEventListener('input',()=>{
    const point=locations.parseCoordinates(coordsInput.value);
    coordsHint.textContent=point?'坐标有效':'格式示例：31.23, 121.47（纬度, 经度）';
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
  const darkToggle=required('#darkMode');
  darkToggle.addEventListener('click',()=>{
    if(!themeSchedule.isAutoActive())return;
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
  preferences.subscribe(()=>{if(revealed){renderPreferences();renderTheme();}});
  document.addEventListener('ambilight-theme-change',()=>renderTheme());
  setInterval(()=>{
    if(document.hidden)return;
    renderTheme();
  },20000);
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
    themeSchedule.restore?.().then(restored=>{
      if(!restored)return;
      renderTheme();
      renderPreferences();
    });
  }
  const revealTimer=setInterval(reveal,3000);
  Promise.all([settings.ready,preferences.ready]).then(reveal);

  } catch(error) {
    fail(error);
    if(status)status.dataset.ready='true';
    document.querySelector('#settings')?.removeAttribute('inert');
    document.querySelector('#preferences')?.removeAttribute('inert');
  }
})();
