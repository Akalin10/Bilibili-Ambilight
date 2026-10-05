(() => {
  'use strict';
  const app=globalThis.BilibiliAmbilight;
  app.CanvasRenderer=class CanvasRenderer {
    constructor(canvas,settings){
      this.canvas=canvas;this.settings=settings;this.type='canvas2d';
      this.context=canvas.getContext('2d',{alpha:true});
      this.history=document.createElement('canvas');
      this.historyContext=this.history.getContext('2d',{alpha:false,willReadFrequently:true});
      if(!this.context || !this.historyContext)throw new Error('Canvas2D 初始化失败');
      this.reset();
    }
    reset(){this.lastTime=null;}
    draw(source,time){
      const w=source.width,h=source.height;
      if(this.canvas.width!==w || this.canvas.height!==h || this.history.width!==w || this.history.height!==h){
        this.canvas.width=this.history.width=w;this.canvas.height=this.history.height=h;this.reset();
      }
      this.historyContext.globalAlpha=this.lastTime===null || this.settings.fadeMs===0 ? 1 :
        1-Math.exp(-Math.max(1,time-this.lastTime)/this.settings.fadeMs);
      this.historyContext.drawImage(source,0,0);this.historyContext.globalAlpha=1;
      this.lastTime=time;this.present();
    }
    present(){
      if(this.lastTime===null)return;
      const w=this.canvas.width,h=this.canvas.height,b=this.videoBounds;
      const layout=app.Projection.layout(w,h,b,this.projectionAspect,this.settings);
      const key=JSON.stringify([w,h,b,layout.width,layout.height,layout.scaleX,layout.scaleY,layout.edgeInset]);
      if(this.projectionKey!==key){
        this.projectionKey=key;
        this.sampling=app.Projection.map(w,h,layout.width,layout.height,(x,y)=>{
          if(!b)return [x,y];
          const u=(x-b[0])/b[2],v=(y-b[1])/b[3];
          const px=.5+(u-.5)/layout.scaleX,py=.5+(v-.5)/layout.scaleY;
          const extent=Math.max(0,2*Math.abs(u-.5)-1,(2*Math.abs(v-.5)-1)/layout.aspect);
          const layer=extent;
          const edgeX=.5+(u-.5)/(1+layer),edgeY=.5+(v-.5)/(1+layer*layout.aspect);
          return [Math.max(layout.edgeInset,Math.min(1-layout.edgeInset,edgeX)),
            Math.max(layout.edgeInset,Math.min(1-layout.edgeInset,edgeY)),px>=0 && px<=1 && py>=0];
        });
        this.projectionIndices=this.sampling.indices;
        this.upsampling=app.Projection.map(layout.width,layout.height,w,h,(x,y)=>[x,y]);
        this.projectedPixels=new Float32Array(layout.width*layout.height*4);
        this.blurTemp=new Float32Array(this.projectedPixels.length);
        this.presentedFrame=this.context.createImageData(w,h);
      }
      const input=this.historyContext.getImageData(0,0,w,h).data;
      const projected=this.projectedPixels,map=this.sampling;
      for(let i=0;i<projected.length;i+=4){
        const coverage=map.coverage[i/4];
        for(let c=0;c<3;c++)projected[i+c]=coverage*(input[map.indices[i]+c]*map.weights[i]+
          input[map.indices[i+1]+c]*map.weights[i+1]+input[map.indices[i+2]+c]*map.weights[i+2]+
          input[map.indices[i+3]+c]*map.weights[i+3]);
        projected[i+3]=coverage*255;
      }
      const blurred=app.Projection.blur(projected,this.blurTemp,layout),up=this.upsampling;
      const strength=this.settings.strength ?? .55,spread=this.settings.spread ?? 1.2;
      const maskKey=JSON.stringify([w,h,b,strength,spread,this.presentationFade]);
      if(this.maskKey!==maskKey){
        this.maskKey=maskKey;this.alphaMask=new Float32Array(w*h);
        const smooth=(a,z,t)=>{t=Math.max(0,Math.min(1,(t-a)/(z-a)));return t*t*(3-2*t);};
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const px=(x+.5)/w,py=(y+.5)/h,i=y*w+x;
          if(b){
            const dx=Math.max(b[0]-px,px-b[0]-b[2],0)/b[2],dy=Math.max(b[1]-py,py-b[1]-b[3],0)/b[3];
            const near=1-smooth(0,.85*Math.max(.001,spread)/1.2,Math.hypot(dx,dy));
            const depth=Math.max(0,Math.min(1,(py-b[1]-b[3])/Math.max(.001,1-b[1]-b[3])));
            const opticalDepth=depth*depth*depth*(depth*(depth*6-15)+10);
            const transmission=(Math.exp(-3*opticalDepth)-Math.exp(-3))/(1-Math.exp(-3));
            this.alphaMask[i]=Math.min(1,strength/.55)*(strength+(1-strength)*near)*transmission*(1-smooth(.75,1,depth));
            
          }else{
            this.alphaMask[i]=this.presentationFade<1 ? 1-smooth(this.presentationFade,1,py) : 1;
            
          }
        }
      }
      const out=this.presentedFrame.data;
      for(let i=0;i<out.length;i+=4){
        const i0=up.indices[i],i1=up.indices[i+1],i2=up.indices[i+2],i3=up.indices[i+3];
        const a=up.weights[i],b=up.weights[i+1],c=up.weights[i+2],d=up.weights[i+3];
        const alpha=blurred[i0+3]*a+blurred[i1+3]*b+blurred[i2+3]*c+blurred[i3+3]*d;
        if(alpha<.0001){out[i]=out[i+1]=out[i+2]=out[i+3]=0;continue;}
        const r=(blurred[i0]*a+blurred[i1]*b+blurred[i2]*c+blurred[i3]*d)*255/alpha;
        const g=(blurred[i0+1]*a+blurred[i1+1]*b+blurred[i2+1]*c+blurred[i3+1]*d)*255/alpha;
        const blue=(blurred[i0+2]*a+blurred[i1+2]*b+blurred[i2+2]*c+blurred[i3+2]*d)*255/alpha;
        const l=r*.2126+g*.7152+blue*.0722;
        const saturation=this.settings.saturation ?? 1,brightness=this.settings.brightness ?? 1;
        out[i]=(l+(r-l)*saturation)*brightness;out[i+1]=(l+(g-l)*saturation)*brightness;
        out[i+2]=(l+(blue-l)*saturation)*brightness;out[i+3]=alpha*this.alphaMask[i/4];
      }
      this.context.putImageData(this.presentedFrame,0,0);
    }
    destroy(){this.reset();this.history.width=this.history.height=1;}
  };
})();
