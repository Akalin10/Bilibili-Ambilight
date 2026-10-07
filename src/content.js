(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight;
  if (app.started) return;
  app.started = true;
  let instance=null, observer=null, timer=null, queued=null, stopped=false;
  let lastUrl=location.href;
  // 亮色模式只影响背景板，<html> 上的类由 settings.syncTheme() 统一维护，
  // 这里额外把类同步到 <body>，方便按页面范围书写覆盖规则。
  function applyTheme(settings=app.settings.value){
    const light=settings.lightMode===true;
    if(document.body && document.body.classList.contains('ambilight-light')!==light)
      document.body.classList.toggle('ambilight-light',light);
  }
  function reconcile() {
    queued=null;
    if(stopped)return;
    if(!document.body){queue();return;}
    const settings=app.settings.value;
    const video=settings.enabled && app.player.isVideoPage()?app.player.findVideoElement():null;
    const player=video && app.player.findPlayerContainer(video);
    if(instance && instance.video===video && player && instance.player!==player)instance.setPlayer(player);
    if(instance && (instance.video!==video || instance.player!==player || !instance.host.isConnected)) {
      instance.destroy();instance=null;
    }
    if(video && player?.parentElement) {
      if(!instance) {
        try {instance=new app.AmbientLight(video,player,settings);}
        catch(error){console.warn('[Bilibili Ambilight] 初始化失败。',error);}
      } else instance.updateGeometry();
    }
    applyTheme(settings);
    document.body.classList.toggle('bilibili-ambilight-bangumi',!!instance && app.player.isBangumiPage());
    document.body.classList.toggle('bilibili-ambilight-list',!!instance && app.player.isListPage());
    app.syncBewlyCompatibility?.(!!instance);
    app.syncVoteCompatibility?.(!!instance);
    if(location.href!==lastUrl){lastUrl=location.href;instance?.onRefresh();}
  }
  function queue(){if(!stopped && queued===null)queued=setTimeout(reconcile,100);}
  function start(){
    stopped=false;
    if(!document.documentElement || !document.body){
      document.addEventListener('DOMContentLoaded',start,{once:true});return;
    }
    observer?.disconnect();clearInterval(timer);
    app.settings.syncTheme();
    observer=new MutationObserver(records=>{
      if(records.some(record=>!record.target.closest?.('.bilibili-ambilight') &&
          app.player.isRelevantMutation(record,instance?.video)))queue();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true,
      attributes:true,attributeFilter:['class','src']});
    timer=setInterval(()=>{if(location.href!==lastUrl)queue();},500);
    reconcile();
  }
  app.settings.subscribe(settings=>{
    if(stopped)return;
    applyTheme(settings);
    instance?.applySettings(settings);queue();
  });
  document.addEventListener('fullscreenchange',queue);
  window.addEventListener('popstate',queue);
  window.addEventListener('pagehide',()=>{
    stopped=true;observer?.disconnect();clearInterval(timer);clearTimeout(queued);queued=null;
    instance?.destroy();instance=null;
    app.syncBewlyCompatibility?.(false);
    app.syncVoteCompatibility?.(false);
    document.body?.classList.remove('bilibili-ambilight-bangumi');
    document.body?.classList.remove('bilibili-ambilight-list');
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)start();});
  app.settings.ready.then(()=>{if(!stopped)start();});
})();
