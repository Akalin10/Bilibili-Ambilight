(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight;
  if (app.started) return;
  app.started = true;
  let instance=null, observer=null, timer=null, queued=null, stopped=false;
  let lastUrl=location.href;
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
    document.body.classList.toggle('bilibili-ambilight-bangumi',!!instance && app.player.isBangumiPage());
    document.body.classList.toggle('bilibili-ambilight-list',!!instance && app.player.isListPage());
    if(location.href!==lastUrl){lastUrl=location.href;instance?.onRefresh();}
  }
  function queue(){if(!stopped && queued===null)queued=setTimeout(reconcile,100);}
  function start(){
    stopped=false;
    if(!document.documentElement || !document.body){
      document.addEventListener('DOMContentLoaded',start,{once:true});return;
    }
    observer?.disconnect();clearInterval(timer);
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
    instance?.applySettings(settings);queue();
  });
  document.addEventListener('fullscreenchange',queue);
  window.addEventListener('popstate',queue);
  window.addEventListener('pagehide',()=>{
    stopped=true;observer?.disconnect();clearInterval(timer);clearTimeout(queued);queued=null;
    instance?.destroy();instance=null;
    document.body?.classList.remove('bilibili-ambilight-bangumi');
    document.body?.classList.remove('bilibili-ambilight-list');
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)start();});
  app.settings.ready.then(()=>{if(!stopped)start();});
})();
