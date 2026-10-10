(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight = globalThis.BilibiliAmbilight || {};
  app.AmbientLight = class AmbientLight {
    constructor(video, player, settings = app.settings.value) {
      this.settings = {...settings};
      this.policy = new app.PerformancePolicy(this.settings);
      this.lastDrawTime = -Infinity;
      this.lastFrameMediaTime = null;
      this.nextFrameMediaTime = null;
      this.frameLimit = this.policy.fps;
      this.lastFrameTime = -Infinity;
      this.videoVisible = true;
      this.videoVisibilityChangedAt = performance.now();
      this.lastScrollTime = -Infinity;
      this.video = video;
      this.player = player;
      this.callbackId = null;
      this.destroyed = false;
      this.failed = false;
      this.useVideoFrames = typeof video.requestVideoFrameCallback === 'function';
      this.buffer = document.createElement('canvas');
      this.buffer.width = this.policy.level.width;
      this.buffer.height = this.policy.level.height;
      this.bufferContext = this.buffer.getContext('2d', { alpha: false });
      this.layer = document.createElement('div');
      this.layer.className = 'bilibili-ambilight';
      this.layer.setAttribute('aria-hidden', 'true');
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'bilibili-ambilight-canvas';
      this.canvas.width = this.buffer.width;
      this.canvas.height = this.buffer.height;
      if (!this.bufferContext) throw new Error('Canvas2D 初始化失败');
      this.createRenderer();
      this.applyVisualSettings();
      this.layer.append(this.canvas);

      this.mount(app.player.findLightHost(video, player));
      this.lastMediaTime = -1;
      this.updateGeometry = this.updateGeometry.bind(this);
      this.onFrame = this.onFrame.bind(this);
      this.onPlay = () => {
        this.lastFrameMediaTime=null;this.nextFrameMediaTime=null;this.videoVisibilityChangedAt=performance.now();
        this.policy.playback=null;this.schedule();this.draw();
      };
      this.onStop = () => { this.cancel(); this.draw(); };
      this.onRefresh = () => {
        this.failed=false; this.renderer.reset(); this.lastDrawTime=-Infinity;
        this.lastMediaTime=-1;this.lastFrameMediaTime=null;this.nextFrameMediaTime=null;
        this.videoVisibilityChangedAt=performance.now();this.policy.playback=null;
        this.schedule();this.draw();
      };
      this.onVisibility = () => {
        if (document.hidden) this.cancel();
        else this.onRefresh();
      };
      this.listeners = [
        ['playing', this.onPlay], ['pause', this.onStop], ['ended', this.onStop],
        ['seeking', () => { this.cancel(); this.renderer.reset(); }],
        ['loadeddata', this.onRefresh], ['seeked', this.onRefresh],
        ['emptied', () => { this.cancel(); this.renderer.reset(); this.layer.dataset.ready = 'false'; }],
      ];
      for (const [event, listener] of this.listeners) video.addEventListener(event, listener);
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('resize', this.updateGeometry);
      document.addEventListener('fullscreenchange', this.updateGeometry);
      this.onScroll = event => {
        const target=event.target;
        const windowScroll=target===document || target===window || target===document.documentElement || target===document.body;
        if(!windowScroll && !target.contains?.(this.video))return;
        this.lastScrollTime=performance.now();
        if(this.fullscreen || this.mini || (windowScroll && !this.scrollTracksLayout))return;
        this.queueGeometryUpdate(false);
      };
      window.addEventListener('scroll',this.onScroll,{passive:true,capture:true});
      this.resizeObserver = new ResizeObserver(this.updateGeometry);
      this.resizeObserver.observe(player);
      this.resizeObserver.observe(this.host);
      this.geometryObserver=new MutationObserver(()=>this.queueGeometryUpdate(true));
      this.observeGeometryAncestors();
      this.visibilityObserver = new IntersectionObserver(entries => {
        for(const entry of entries){
          if(entry.target===this.video){
            const visible=entry.isIntersecting;
            if(visible!==this.videoVisible){
              this.videoVisible=visible;this.videoVisibilityChangedAt=performance.now();
              this.policy.playback=null;
            }
            continue;
          }
          const offscreen=!entry.isIntersecting;
          if(offscreen===this.offscreen)continue;
          this.offscreen=offscreen;this.layer.dataset.inView=String(!offscreen);
          if(offscreen)this.cancel();else this.onRefresh();
        }
      });
      this.visibilityObserver.observe(this.layer);
      this.visibilityObserver.observe(video);
      this.updateGeometry();
      this.draw();
      this.schedule();
    }

    applyVisualSettings() {
      this.layer.style.setProperty('--ambilight-spread-x', this.settings.spread);
      this.layer.style.setProperty('--ambilight-spread-y', 1+(this.settings.spread-1)*1.3);
      this.layer.style.setProperty('--ambilight-blur', `${this.settings.blur}px`);
      this.layer.style.setProperty('--ambilight-strength', this.settings.strength);
    }

    applySettings(settings) {
      const qualityChanged=this.settings.quality!==settings.quality || this.settings.fpsLimit!==settings.fpsLimit;
      Object.assign(this.settings,settings);
      if(qualityChanged)this.policy.configure(this.settings);
      this.applyVisualSettings();
      if(!settings.enabled){this.cancel();this.layer.dataset.ready='false';return;}
      this.onRefresh();
    }

    releaseHost() {
      if(!this.host)return;
      if(!this.hostHadClass)this.host.classList.remove('bilibili-ambilight-host');
      if(this.positionChanged)this.host.style.position=this.originalPosition;
      if(this.host===document.documentElement && !this.bodyHadClass)document.body.classList.remove('bilibili-ambilight-page');
      if(this.host===document.documentElement)document.body.classList.remove('bilibili-ambilight-mini');
    }

    mount(host) {
      if(this.host===host)return;
      if(this.host)this.resizeObserver?.unobserve(this.host);
      this.releaseHost();
      this.host=host;
      if(host===document.documentElement){
        this.bodyHadClass=document.body.classList.contains('bilibili-ambilight-page');
        document.body.classList.add('bilibili-ambilight-page');
      }
      this.originalPosition=host.style.position;
      this.positionChanged=getComputedStyle(host).position==='static';
      if(this.positionChanged)host.style.position='relative';
      this.hostHadClass=host.classList.contains('bilibili-ambilight-host');
      host.classList.add('bilibili-ambilight-host');
      host.prepend(this.layer);
      this.resizeObserver?.observe(host);
    }

    createRenderer(forceCanvas = false) {
      if (!forceCanvas) {
        try {
          this.renderer = new app.WebGLRenderer(this.canvas, this.settings, () => this.fallback());
        } catch (error) {
          console.info('[Bilibili Ambilight] WebGL 不可用，使用 Canvas2D。', error.message);
        }
      }
      if (!this.renderer) {
        const replacement = document.createElement('canvas');
        replacement.className = this.canvas.className;
        this.canvas.replaceWith(replacement);
        this.canvas = replacement;
        this.renderer = new app.CanvasRenderer(this.canvas, this.settings);
      }
      this.layer.dataset.renderer = this.renderer.type;
    }

    fallback() {
      if (this.destroyed || this.renderer.type !== 'webgl') return;
      this.renderer.destroy();
      this.renderer = null;
      this.createRenderer(true);
      this.updateGeometry();
      this.draw();
    }

    setPlayer(player) {
      if(this.player===player)return;
      this.resizeObserver.unobserve(this.player);
      this.player=player;
      this.resizeObserver.observe(player);
      this.updateGeometry();
    }

    updateGeometry() {
      if (this.destroyed) return;
      this.observeGeometryAncestors();
      this.mount(app.player.findLightHost(this.video,this.player));
      const fullscreen=app.player.findFullscreenContainer(this.video);
      const mini=!fullscreen && app.player.isMiniPlayer(this.video,this.player);
      this.fullscreen=fullscreen;
      const mode=fullscreen?'player':'page';
      if(this.layer.dataset.mode!==mode)this.layer.dataset.mode=mode;
      const oldFade=this.renderer.presentationFade;
      const oldBounds=this.renderer.videoBounds;
      const oldAspect=this.renderer.projectionAspect;
      this.renderer.projectionAspect=this.video.videoWidth/this.video.videoHeight || 16/9;
      this.renderer.videoBounds=null;
      this.renderer.presentationFade=1;
      if(!fullscreen){
        const geometry=app.player.pageGeometry(this.video,this.player,this.pageGeometry,mini);
        this.geometryUnavailable=!geometry;
        if(!geometry){this.setMiniState(mini);this.cancel();return;}
        this.setMiniState(mini || geometry.mini===true);
        this.scrollTracksLayout=false;
        for(let e=this.video;e && e!==document.documentElement;e=e.parentElement){
          const position=getComputedStyle(e).position;
          if(position==='sticky' || position==='fixed'){this.scrollTracksLayout=true;break;}
        }
        this.applyPageGeometry(geometry,oldBounds,oldFade,oldAspect);
        return;
      }
      this.setMiniState(false);
      this.geometryUnavailable=false;
      const playerRect=fullscreen.getBoundingClientRect();
      const hostRect = this.host.getBoundingClientRect();
      this.setGeometryStyle('left',playerRect.left-hostRect.left-this.host.clientLeft+this.host.scrollLeft);
      this.setGeometryStyle('top',playerRect.top-hostRect.top-this.host.clientTop+this.host.scrollTop);
      this.setGeometryStyle('width',playerRect.width);this.setGeometryStyle('height',playerRect.height);
      if(oldFade!==this.renderer.presentationFade || oldBounds)this.renderer.present();
    }

    setGeometryStyle(property,value) {
      const next=`${Math.round(value*1000)/1000}px`;
      if(this.layer.style[property]!==next)this.layer.style[property]=next;
    }

    setMiniState(mini) {
      this.mini=mini;
      if(document.body.classList.contains('bilibili-ambilight-mini')!==mini)
        document.body.classList.toggle('bilibili-ambilight-mini',mini);
      if(this.layer.dataset.mini!==String(mini))this.layer.dataset.mini=String(mini);
    }

    observeGeometryAncestors() {
      if(!this.geometryObserver)return;
      const ancestors=[];
      for(let e=this.video;e && e!==document.body && e!==document.documentElement;e=e.parentElement)ancestors.push(e);
      if(this.geometryAncestors?.length===ancestors.length && ancestors.every((e,i)=>e===this.geometryAncestors[i]))return;
      this.geometryObserver.disconnect();this.geometryAncestors=ancestors;
      for(const e of ancestors)this.geometryObserver.observe(e,{attributes:true,attributeFilter:['class','style']});
    }

    queueGeometryUpdate(full) {
      if(this.destroyed)return;
      this.geometryDirty ||= full;
      if(this.geometryFrame==null)this.geometryFrame=requestAnimationFrame(()=>{
        this.geometryFrame=null;
        const dirty=this.geometryDirty;this.geometryDirty=false;
        if(dirty)this.updateGeometry();else this.updateScrollGeometry();
      });
    }

    applyPageGeometry(geometry,oldBounds=this.renderer.videoBounds,oldFade=this.renderer.presentationFade,oldAspect=this.renderer.projectionAspect) {
      this.pageGeometry=geometry;
      const pageRect=geometry.player,frame=geometry.frame;
      const padding=Math.max(360,pageRect.height*.7),tail=Math.max(1000,pageRect.height*2.1);
      const height=padding+pageRect.height+tail,width=document.documentElement.clientWidth;
      this.setGeometryStyle('left',0);this.setGeometryStyle('top',pageRect.top-padding);
      this.setGeometryStyle('width',width);this.setGeometryStyle('height',height);
      const bounds=[frame.left/width,(padding+frame.top-pageRect.top)/height,frame.width/width,frame.height/height];
      const boundsChanged=!oldBounds || bounds.some((n,i)=>Math.abs(n-oldBounds[i])>1e-6);
      this.renderer.videoBounds=boundsChanged?bounds:oldBounds;
      this.renderer.projectionAspect=frame.width/frame.height;
      this.renderer.presentationFade=(padding+pageRect.height*.7)/height;
      if(boundsChanged || Math.abs(oldFade-this.renderer.presentationFade)>1e-6 ||
          Math.abs(oldAspect-this.renderer.projectionAspect)>1e-6)this.renderer.present();
    }

    updateScrollGeometry() {
      if(this.destroyed || this.fullscreen || this.mini)return;
      const geometry=app.player.pageGeometry(this.video,this.player,this.pageGeometry,false);
      if(geometry){
        if(geometry.mini)this.setMiniState(true);
        this.applyPageGeometry(geometry);
      }
    }

    draw() {
      if (this.destroyed || this.failed || this.geometryUnavailable || !this.settings.enabled || document.hidden || this.offscreen || this.video.readyState < 2 ||
          !this.video.videoWidth || !this.video.videoHeight) return;
      try {
        const started=performance.now();
        const scale = Math.min(this.policy.level.width / this.video.videoWidth,
          this.policy.level.height / this.video.videoHeight);
        const width = Math.max(1, Math.round(this.video.videoWidth * scale));
        const height = Math.max(1, Math.round(this.video.videoHeight * scale));
        if (this.buffer.width !== width || this.buffer.height !== height) {
          this.buffer.width = width;
          this.buffer.height = height;
        }
        if(this.renderer.type==='webgl'){
          this.renderer.draw(this.video,performance.now(),width,height);
        }else{
          this.bufferContext.drawImage(this.video,0,0,width,height);
          this.renderer.draw(this.buffer,performance.now());
        }
        if(this.layer.dataset.ready!=='true')this.layer.dataset.ready='true';
        this.lastMediaTime = this.video.currentTime;
        this.lastDrawTime=started;
        this.policy.record(performance.now()-started,this.frameLateness || 0,started);
        if(this.settings.quality==='auto' && typeof this.video.getVideoPlaybackQuality==='function' &&
            (!this.policy.playback || started-this.policy.playback.time>=1000)){
          const playback=this.video.getVideoPlaybackQuality();
          this.policy.recordPlayback(playback.totalVideoFrames,playback.droppedVideoFrames,started,
            this.videoVisible && started-this.videoVisibilityChangedAt>2000 && started-this.lastScrollTime>2000);
        }
        if(this.layer.dataset.quality!==this.policy.level.name)this.layer.dataset.quality=this.policy.level.name;
        const fps=String(this.policy.fps);
        if(this.layer.dataset.fps!==fps)this.layer.dataset.fps=fps;
        return true;
      } catch (error) {
        if (error.name === 'InvalidStateError') return;
        if (this.renderer.type === 'webgl') {
          console.warn('[Bilibili Ambilight] WebGL 绘制失败，使用 Canvas2D。', error);
          this.fallback();
          return;
        }
        this.failed = true;
        this.cancel();
        this.layer.dataset.ready = 'false';
        console.warn('[Bilibili Ambilight] 视频采样失败，已停止环境光。', error);
      }
    }

    schedule() {
      if (this.destroyed || this.failed || this.geometryUnavailable || !this.settings.enabled || this.callbackId !== null || document.hidden ||
          this.offscreen || this.video.seeking || this.video.paused || this.video.ended) return;
      this.callbackId = this.useVideoFrames
        ? this.video.requestVideoFrameCallback(this.onFrame)
        : requestAnimationFrame(this.onFrame);
    }

    onFrame(time, metadata) {
      this.callbackId = null;
      if (this.destroyed) return;
      this.schedule();
      this.frameLateness=metadata ? Math.max(0,performance.now()-metadata.expectedDisplayTime) : 0;
      const mediaTime=metadata?.mediaTime ?? this.video.currentTime;
      const fps=this.policy.fps,interval=1/fps;
      if(this.frameLimit!==fps || (this.lastFrameMediaTime!==null && mediaTime<this.lastFrameMediaTime)){
        this.nextFrameMediaTime=null;this.frameLimit=fps;
      }
      const due=metadata ? fps>=60 || this.nextFrameMediaTime===null || mediaTime>=this.nextFrameMediaTime-.001
        : time-this.lastFrameTime>=1000/fps-.5;
      if(due && (this.useVideoFrames || this.lastMediaTime!==this.video.currentTime) && this.draw()){
        this.nextFrameMediaTime=this.nextFrameMediaTime===null || mediaTime-this.nextFrameMediaTime>interval*2
          ? mediaTime+interval : this.nextFrameMediaTime+interval;
        this.lastFrameMediaTime=mediaTime;this.lastFrameTime=time;
      }
    }

    cancel() {
      if (this.callbackId === null) return;
      if (this.useVideoFrames) this.video.cancelVideoFrameCallback(this.callbackId);
      else cancelAnimationFrame(this.callbackId);
      this.callbackId = null;
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.cancel();
      for (const [event, listener] of this.listeners) this.video.removeEventListener(event, listener);
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('resize', this.updateGeometry);
      document.removeEventListener('fullscreenchange', this.updateGeometry);
      window.removeEventListener('scroll',this.onScroll,true);
      if(this.geometryFrame!=null)cancelAnimationFrame(this.geometryFrame);
      this.resizeObserver.disconnect();
      this.geometryObserver.disconnect();
      this.visibilityObserver.disconnect();
      this.renderer.destroy();
      this.layer.remove();
      this.releaseHost();
      this.buffer.width = this.buffer.height = this.canvas.width = this.canvas.height = 1;
    }
  };
})();
