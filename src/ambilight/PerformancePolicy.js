(() => {
  'use strict';
  const app=globalThis.BilibiliAmbilight;
  const levels=[{name:'low',width:160,height:90},
    {name:'medium',width:320,height:180},{name:'high',width:480,height:270}];
  const autoLevels=[levels[0],{name:'low',width:128,height:72},{name:'low',width:96,height:54}];
  app.PerformancePolicy=class PerformancePolicy {
    constructor(settings){this.configure(settings);}
    configure(settings){
      this.settings=settings;
      this.index=settings.quality==='auto'?0:['low','medium','high'].indexOf(settings.quality);
      this.samples=0;this.average=0;this.averageLateness=0;this.good=0;this.lastChange=-Infinity;
      this.autoFps=60;
      this.autoIndex=0;this.dropStreak=0;this.healthySince=null;
      this.playback=null;this.playbackLoss=null;
    }
    get level(){return this.settings.quality==='auto'?autoLevels[this.autoIndex]:levels[this.index];}
    get fps(){return Math.min(this.settings.fpsLimit,this.settings.quality==='auto'?this.autoFps:60);}
    reduce(time){
      if(time-this.lastChange<3000)return false;
      if(this.autoIndex<autoLevels.length-1)this.autoIndex++;
      else if(this.autoFps>15)this.autoFps=Math.max(15,Math.floor(this.autoFps/2));
      else return false;
      this.lastChange=time;this.samples=0;this.good=0;this.healthySince=null;this.dropStreak=0;
      return true;
    }
    recordPlayback(total,dropped,time,eligible=true){
      const previous=this.playback;
      if(previous && time-previous.time<1000)return;
      this.playback={total,dropped,time};
      if(this.settings.quality!=='auto' || !previous || !eligible){this.dropStreak=0;this.playbackLoss=null;return;}
      const frames=total-previous.total, lost=dropped-previous.dropped;
      this.playbackLoss=frames>=10?Math.max(0,lost)/frames:null;
      const pressure=this.average>1000/this.fps*.2;
      this.dropStreak=frames>=10 && lost>=2 && lost/frames>0.05 && pressure?this.dropStreak+1:0;
      if(this.dropStreak>=3)this.reduce(time);
    }
    record(cost,lateness,time){
      if(this.settings.quality!=='auto')return false;
      this.average=this.samples?this.average*0.9+cost*0.1:cost;
      this.averageLateness=this.samples?this.averageLateness*0.9+lateness*0.1:lateness;this.samples++;
      const budget=1000/this.fps;
      const slow=this.average>budget*.65;
      this.good=slow?0:this.good+1;
      if(slow && this.samples>=60)return this.reduce(time);
      const healthy=this.average<budget*.2 && this.dropStreak===0 && (this.playbackLoss===null || this.playbackLoss<=.03);
      if(!healthy)this.healthySince=null;
      else if(this.healthySince===null)this.healthySince=time;
      if(healthy && time-this.healthySince>=6000 && time-this.lastChange>=6000){
        if(this.autoFps<60)this.autoFps=Math.min(60,this.autoFps*2);
        else if(this.autoIndex>0)this.autoIndex--;
        else return false;
        this.lastChange=time;this.healthySince=time;return true;
      }
      return false;
    }
  };
})();
