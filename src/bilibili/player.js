(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  const selectors = {
    player: '#bilibili-player, #bpx-player-container, .bpx-player-container, .bilibili-player',
    video: '.bpx-player-video-wrap video, .bilibili-player-video video, video',
    webFullscreen: '.bpx-state-web, .bilibili-player-mode-webfullscreen',
    miniPlayer: '.bpx-state-mini, .bilibili-player-mode-miniplayer',
  };
  app.player = {
    isBangumiPage() { return /^\/bangumi\/play\/(?:ep|ss)\d+(?:\/|$)/.test(location.pathname); },
    isListPage() {
      return /^\/list\/[^/]+(?:\/|$)/.test(location.pathname) ||
        /^\/medialist\/play\/[^/]+(?:\/|$)/.test(location.pathname) ||
        /^\/watchlater(?:\/|$)/.test(location.pathname);
    },
    isVideoPage() { return /^\/video\/[^/]+/.test(location.pathname) || this.isBangumiPage() || this.isListPage(); },
    findVideoElement() {
      for (const player of document.querySelectorAll(selectors.player)) {
        const video = player.querySelector(selectors.video);
        if (video) return video;
      }
      return null;
    },
    findPlayerContainer(video) {
      return video.closest('#bilibili-player') || video.closest(selectors.player);
    },
    findFullscreenContainer(video) {
      const fullscreen=document.fullscreenElement;
      if(fullscreen?.contains(video))return fullscreen;
      return video.closest(selectors.webFullscreen);
    },
    isMiniPlayer(video, player) {
      if(video.closest(selectors.miniPlayer))return true;
      for(let e=video;e && e!==document.documentElement;e=e.parentElement){
        if(getComputedStyle(e).position==='fixed'){
          const r=e.getBoundingClientRect();
          if(r.width>0 && r.width<innerWidth*.65 && r.height<innerHeight*.65)return true;
        }
      }
      return false;
    },
    pageGeometry(video, player, previous, mini=this.isMiniPlayer(video,player)) {
      const documentRect=e=>{
        const r=e.getBoundingClientRect();
        return {left:r.left+scrollX,top:r.top+scrollY,width:r.width,height:r.height};
      };
      if(!mini){
        const rect=documentRect(player),frame=documentRect(video);
        if(previous && frame.width<previous.frame.width*.8 && frame.height<previous.frame.height*.85){
          const anchor=player.closest('#playerWrap, .player-wrap, #bilibili-player-wrap')?.querySelector('#bilibili-player-placeholder') ||
            document.querySelector('#bilibili-player-placeholder');
          if(anchor && !anchor.contains(video)){
            const a=anchor.getBoundingClientRect();
            if(a.width>frame.width*1.4 && a.height>frame.height*1.2 &&
                frame.width<innerWidth*.65 && frame.height<innerHeight*.65)
              return {...previous,mini:true};
          }
        }
        return {player:rect,frame:frame.width>0 && frame.height>0?frame:rect,mini:false};
      }
      const wrapper=player.closest('#playerWrap, .player-wrap, #bilibili-player-wrap');
      const anchor=wrapper?.querySelector('#bilibili-player-placeholder') ||
        document.querySelector('#bilibili-player-placeholder') || wrapper;
      if(anchor && getComputedStyle(anchor).position!=='fixed'){
        const rect=documentRect(anchor);
        if(rect.width>0 && rect.height>0){
          if(previous){
            const old=previous.player,f=previous.frame;
            const scale=rect.width/old.width;
            if(Math.abs(scale-1)<0.0001)return {...previous,mini:true};
            const pageRect={left:rect.left,top:old.top,width:rect.width,height:old.height*scale};
            return {mini:true,player:pageRect,frame:{left:pageRect.left+(f.left-old.left)*scale,
              top:pageRect.top+(f.top-old.top)*scale,
              width:f.width*scale,height:f.height*scale}};
          }
          const sending=player.querySelector('.bpx-player-sending-area')?.getBoundingClientRect().height || 56;
          return {mini:true,player:rect,frame:{...rect,height:Math.max(1,rect.height-sending)}};
        }
      }
      return previous?{...previous,mini:true}:null;
    },
    findLightHost(video,player) {
      const fullscreen=this.findFullscreenContainer(video);
      return fullscreen && fullscreen!==video ? fullscreen : document.documentElement;
    },
    isRelevantMutation(record,video) {
      if(record.type==='attributes')return record.target===video || !!(video && record.target.contains(video));
      return [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1 &&
        (node===video || node.matches(`${selectors.player}, video`) ||
          node.querySelector(`${selectors.player}, video`) || (video && node.contains(video))));
    },
  };
})();
