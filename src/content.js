(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight;
  if (app.started) return;
  app.started = true;
  let instance=null, observer=null, timer=null, queued=null, stopped=false;
  let lastUrl=location.href;
  let themeObserver=null;
  const themeLinks=new Map();
  const darkTheme='https://s1.hdslb.com/bfs/seed/jinkela/short/bili-theme/dark.css';
  function syncTheme(active) {
    const light=active && app.settings.value.lightMode===true;
    document.documentElement?.classList.toggle('ambilight-light',light);
    document.body?.classList.toggle('ambilight-light',light);
    if(!active) {
      themeObserver?.disconnect();themeObserver=null;
      for(const [link,{href,target}] of themeLinks) {
        if(link.getAttribute('href')===target) {
          if(href===null)link.removeAttribute('href');else link.setAttribute('href',href);
        }
      }
      themeLinks.clear();return;
    }
    const enforce=()=>{
      for(const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const href=link.getAttribute('href');
        const native=/\/bili-theme\/(?:light|dark)(_u)?\.css(?:[?#]|$)/.exec(link.href);
        if(link.id!=='__css-map__' && !native)continue;
        const target=native?link.href.replace(/\/(?:light|dark)(_u)?\.css/, '/dark$1.css'):darkTheme;
        const saved=themeLinks.get(link);
        if(!saved || href!==saved.target)themeLinks.set(link,{href,target});
        if(link.href!==target)link.setAttribute('href',target);
      }
    };
    if(!themeObserver && document.head) {
      themeObserver=new MutationObserver(enforce);
      themeObserver.observe(document.head,{childList:true,subtree:true,attributes:true,attributeFilter:['href']});
    }
    enforce();
  }
  function reconcile() {
    queued=null;
    if(stopped)return;
    if(!document.body){queue();return;}
    const settings=app.settings.value;
    syncTheme(settings.enabled && app.player.isVideoPage());
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
    syncTheme(false);
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
