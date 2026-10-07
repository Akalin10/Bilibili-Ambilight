(() => {
  'use strict';
  const app=globalThis.BilibiliAmbilight;
  function radii(sigma){
    let lower=Math.floor(Math.sqrt(4*sigma*sigma+1));
    if(lower%2===0)lower--;
    lower=Math.max(1,lower);
    const count=Math.max(0,Math.min(3,Math.round((12*sigma*sigma-3*lower*lower-12*lower-9)/(-4*lower-4))));
    return Array.from({length:3},(_,i)=>(i<count?lower-1:lower+1)/2);
  }
  function layout(w,h,b,aspect,settings){
    aspect=aspect || w/h;b=b || [0,0,1,1];
    const blur=(settings.blur || 0)*1.275/512;
    const sx=b[2]*w/aspect*blur,sy=b[3]*h*blur;
    const down=Math.max(1,Math.max(sx,sy)/5);
    const width=Math.max(1,Math.round(w/down)),height=Math.max(1,Math.round(h/down));
    return {width,height,x:radii(sx*width/w),y:radii(sy*height/h),
      scaleX:1+(settings.spread ?? 1.2),scaleY:1+(settings.spread ?? 1.2)*aspect,
      edgeInset:(settings.blur || 0)/100*.1,aspect};
  }
  function map(sw,sh,w,h,coordinates){
    const indices=new Uint32Array(w*h*4),weights=new Float32Array(w*h*4),coverage=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const [u,v,visible]=coordinates((x+.5)/w,(y+.5)/h);
      coverage[y*w+x]=(visible ?? (u>=0 && u<=1 && v>=0 && v<=1))?1:0;
      const sx=Math.max(0,Math.min(sw-1,u*sw-.5)),sy=Math.max(0,Math.min(sh-1,v*sh-.5));
      const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(sw-1,x0+1),y1=Math.min(sh-1,y0+1);
      const fx=sx-x0,fy=sy-y0,i=(y*w+x)*4;
      indices.set([(y0*sw+x0)*4,(y0*sw+x1)*4,(y1*sw+x0)*4,(y1*sw+x1)*4],i);
      weights.set([(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy],i);
    }
    return {indices,weights,coverage};
  }
  function box(source,target,w,h,r,horizontal){
    const lines=horizontal?h:w,length=horizontal?w:h,stride=horizontal?4:w*4,divisor=2*r+1;
    for(let line=0;line<lines;line++){
      const start=horizontal?line*w*4:line*4;
      let a=0,b=0,c=0,d=0;
      for(let j=-r;j<=r;j++){
        const i=start+Math.max(0,Math.min(length-1,j))*stride;
        a+=source[i];b+=source[i+1];c+=source[i+2];d+=source[i+3];
      }
      for(let pos=0;pos<length;pos++){
        const i=start+pos*stride;
        target[i]=a/divisor;target[i+1]=b/divisor;target[i+2]=c/divisor;target[i+3]=d/divisor;
        const add=start+Math.min(length-1,pos+r+1)*stride,remove=start+Math.max(0,pos-r)*stride;
        a+=source[add]-source[remove];b+=source[add+1]-source[remove+1];
        c+=source[add+2]-source[remove+2];d+=source[add+3]-source[remove+3];
      }
    }
  }
  function blur(source,temp,layout){
    for(let i=0;i<3;i++)for(const horizontal of [true,false]){
      const r=(horizontal?layout.x:layout.y)[i];if(!r)continue;
      box(source,temp,layout.width,layout.height,r,horizontal);
      [source,temp]=[temp,source];
    }
    return source;
  }
  function kernel(radii){
    let values=[1];
    for(const r of radii){
      if(!r)continue;
      const next=new Array(values.length+2*r).fill(0),divisor=2*r+1;
      for(let i=0;i<values.length;i++)for(let j=0;j<divisor;j++)next[i+j]+=values[i]/divisor;
      values=next;
    }
    const radius=(values.length-1)/2,count=Math.ceil(radius/2);
    const weights=new Float32Array(9),offsets=new Float32Array(9);weights[0]=values[radius];
    for(let i=1;i<=count;i++){
      const a=2*i-1,b=a+1,wa=values[radius+a]||0,wb=values[radius+b]||0;
      weights[i]=wa+wb;offsets[i]=(a*wa+b*wb)/(wa+wb);
    }
    return {weights,offsets,count};
  }
  app.Projection={layout,map,blur,kernel};
})();
