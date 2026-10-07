(() => {
  'use strict';
  const app = globalThis.BilibiliAmbilight;
  const vertex = `attribute vec2 position; varying vec2 uv;
    void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}`;
  const fragment = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec2 uv;
    uniform sampler2D source; uniform sampler2D history;
    uniform float amount; uniform float saturation; uniform float brightness;
    uniform vec2 blurRadius; uniform bool gaussian; uniform float weights[9]; uniform float offsets[9]; uniform int blurTapCount;
    uniform bool projector; uniform bool presentation; uniform float fadeStart; uniform bool outputDither;
    uniform bool edgeProjection; uniform vec4 videoBounds;
    uniform float strength; uniform float spread; uniform float projectionAspect; uniform float edgeInset;
    void main(){
      if(projector){
        vec2 sampleUv=uv;float coverage=1.0;
        if(edgeProjection){
          vec2 p=vec2(uv.x,1.0-uv.y);
          vec2 scale=vec2(1.0+spread,1.0+spread*projectionAspect);
          vec2 local=0.5+((p-videoBounds.xy)/videoBounds.zw-0.5)/scale;
          coverage=step(0.0,local.x)*step(local.x,1.0)*step(0.0,local.y);
          vec2 q=(p-videoBounds.xy)/videoBounds.zw-0.5;
          float extent=max(0.0,max(2.0*abs(q.x)-1.0,(2.0*abs(q.y)-1.0)/projectionAspect));
          float layer=extent;
          vec2 corresponding=0.5+q/vec2(1.0+layer,1.0+layer*projectionAspect);
          sampleUv=vec2(clamp(corresponding.x,edgeInset,1.0-edgeInset),
            1.0-clamp(corresponding.y,edgeInset,1.0-edgeInset));
        }
        gl_FragColor=vec4(texture2D(source,sampleUv).rgb*coverage,coverage);return;
      }
      if(presentation){
        vec4 projected=texture2D(source,uv);
        float alpha=projected.a*(fadeStart<1.0 ? 1.0-smoothstep(fadeStart,1.0,1.0-uv.y) : 1.0);
        
        if(edgeProjection){
          vec2 p=vec2(uv.x,1.0-uv.y);
          vec2 outside=max(max(videoBounds.xy-p,p-videoBounds.xy-videoBounds.zw),vec2(0.0))/videoBounds.zw;
          float nearEdge=1.0-smoothstep(0.0,0.85*max(0.001,spread)/1.2,length(outside));
          
          float depth=clamp((p.y-videoBounds.y-videoBounds.w)/max(0.001,1.0-videoBounds.y-videoBounds.w),0.0,1.0);
          float opticalDepth=depth*depth*depth*(depth*(depth*6.0-15.0)+10.0);
          float transmission=(exp(-3.0*opticalDepth)-exp(-3.0))/(1.0-exp(-3.0));
          float tail=transmission*(1.0-smoothstep(0.75,1.0,depth));
          alpha=projected.a*min(1.0,strength/0.55)*mix(strength,1.0,nearEdge)*tail;
        }
        vec3 color=projected.a>0.00001 ? projected.rgb/projected.a : vec3(0.0);
        float l=dot(color,vec3(0.2126,0.7152,0.0722));
        color=clamp(mix(vec3(l),color,saturation)*brightness,0.0,1.0);
        float noise=outputDither ? (fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5)/255.0 : 0.0;
        gl_FragColor=vec4(clamp(color+noise,0.0,1.0),alpha);return;
      }
      if(gaussian){
        vec4 b=texture2D(source,uv)*weights[0];
        for(int i=1;i<9;i++){
          if(i<=blurTapCount){
            vec2 offset=blurRadius*offsets[i];
            b+=(texture2D(source,uv+offset)+texture2D(source,uv-offset))*weights[i];
          }
        }
        gl_FragColor=b;return;
      }
      vec3 c=texture2D(source,uv).rgb;
      gl_FragColor=vec4(mix(texture2D(history,uv).rgb,c,amount),1.0);}`;
  app.WebGLRenderer = class WebGLRenderer {
    constructor(canvas, settings, onLost) {
      this.canvas = canvas;
      this.gpuCanvas = document.createElement('canvas');
      this.context = canvas.getContext('2d', {alpha:true, desynchronized:false});
      if(!this.context)throw new Error('Presentation Canvas2D unavailable');
      this.settings = settings;
      this.type = 'webgl';
      this.gl = this.gpuCanvas.getContext('webgl', {
        alpha: true, premultipliedAlpha: false, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: true,
      });
      if (!this.gl) throw new Error('WebGL 不可用');
      this.textures = [];
      this.frames = [];
      this.shaders = [];
      const gl = this.gl;
      const half=gl.getExtension('OES_texture_half_float');
      const renderable=gl.getExtension('EXT_color_buffer_half_float');
      const linear=gl.getExtension('OES_texture_half_float_linear');
      this.intermediateType=half && renderable && linear ? half.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
      try {
        this.program = gl.createProgram();
        for (const [type, text] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
          const shader = gl.createShader(type);
          this.shaders.push(shader);
          gl.shaderSource(shader, text); gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
          gl.attachShader(this.program, shader);
        }
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
        gl.useProgram(this.program);
        this.vertices = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
        const location = gl.getAttribLocation(this.program, 'position');
        gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
        this.uniforms = {};
        for (const name of ['source','history','amount','saturation','brightness','blurRadius','blurTapCount','gaussian','projector','presentation','fadeStart','outputDither','weights[0]','offsets[0]','edgeProjection','videoBounds','strength','spread','projectionAspect','edgeInset'])
          this.uniforms[name] = gl.getUniformLocation(this.program, name);
        gl.uniform1i(this.uniforms.source, 0); gl.uniform1i(this.uniforms.history, 1);
        for (let i=0; i<5; i++) {
          const texture = gl.createTexture(); this.textures.push(texture);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          if (i) this.frames.push(gl.createFramebuffer());
        }
        this.onLost = event => { event.preventDefault(); onLost(); };
        this.gpuCanvas.addEventListener('webglcontextlost', this.onLost);
        this.reset();
      } catch (error) { this.destroy(); throw error; }
    }
    reset() { this.lastTime = null; this.index = 0; this.hasFrame=false; }
    resize(width, height) {
      const gl = this.gl;
      this.canvas.width = this.gpuCanvas.width = width;
      this.canvas.height = this.gpuCanvas.height = height;
      this.width = width; this.height = height;
      gl.viewport(0,0,width,height);
      for (let i=0; i<3; i++) {
        gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,i?this.intermediateType:gl.UNSIGNED_BYTE,null);
        if (i) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.frames[i-1]);
          gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.textures[i],0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)
            throw new Error('WebGL framebuffer 初始化失败');
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      this.blurWidth=this.blurHeight=0;
      this.sourceWidth=width;this.sourceHeight=height;
      this.reset();
    }
    draw(source, time, width=source.width, height=source.height) {
      const gl = this.gl;
      if (gl.isContextLost()) return;
      if (this.width!==width || this.height!==height) this.resize(width,height);
      const target = 1-this.index;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.textures[0]);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      const sourceWidth=source.videoWidth || source.width,sourceHeight=source.videoHeight || source.height;
      if(this.sourceWidth!==sourceWidth || this.sourceHeight!==sourceHeight){
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        const error=gl.getError();
        if(error!==gl.NO_ERROR)throw new Error(`WebGL 视频上传失败 (${error})`);
        this.sourceWidth=sourceWidth;this.sourceHeight=sourceHeight;
      }else {
        gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
        if(!this.hasFrame){
          const error=gl.getError();
          if(error!==gl.NO_ERROR)throw new Error(`WebGL 视频上传失败 (${error})`);
        }
      }
      gl.uniform1i(this.uniforms.gaussian,0);
      gl.uniform1i(this.uniforms.projector,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[0]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,this.textures[this.index+1]);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.frames[target]);
      gl.uniform1i(this.uniforms.presentation,0);
      gl.viewport(0,0,this.width,this.height);
      gl.uniform1f(this.uniforms.amount,this.lastTime===null || this.settings.fadeMs===0 ? 1 :
        1-Math.exp(-Math.max(1,time-this.lastTime)/this.settings.fadeMs));
      gl.uniform1f(this.uniforms.saturation,this.settings.saturation);
      gl.uniform1f(this.uniforms.brightness,this.settings.brightness);
      gl.uniform2f(this.uniforms.blurRadius,0,0);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      this.index=target; this.lastTime=time;this.hasFrame=true;
      this.present();
    }
    present() {
      if(!this.hasFrame || this.gl.isContextLost())return;
      const gl=this.gl;
      const layout=app.Projection.layout(this.width,this.height,this.videoBounds,this.projectionAspect,this.settings);
      gl.activeTexture(gl.TEXTURE0);
      if(this.blurWidth!==layout.width || this.blurHeight!==layout.height){
        this.blurWidth=layout.width;this.blurHeight=layout.height;
        for(let i=3;i<5;i++){
          gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,layout.width,layout.height,0,gl.RGBA,this.intermediateType,null);
          gl.bindFramebuffer(gl.FRAMEBUFFER,this.frames[i-1]);
          gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.textures[i],0);
          if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Projector framebuffer incomplete');
        }
      }
      gl.viewport(0,0,layout.width,layout.height);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.textures[0]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.textures[this.index+1]);
      gl.uniform1f(this.uniforms.amount,1);
      gl.uniform1f(this.uniforms.saturation,this.settings.saturation); gl.uniform1f(this.uniforms.brightness,this.settings.brightness);
      gl.uniform1i(this.uniforms.edgeProjection,this.videoBounds?1:0);
      gl.uniform4fv(this.uniforms.videoBounds,this.videoBounds || [0,0,1,1]);
      gl.uniform1f(this.uniforms.strength,this.settings.strength ?? 0.55);
      gl.uniform1f(this.uniforms.spread,this.settings.spread ?? 1.2);
      gl.uniform1f(this.uniforms.projectionAspect,this.projectionAspect || this.width/this.height);
      gl.uniform1f(this.uniforms.edgeInset,layout.edgeInset);
      gl.uniform1i(this.uniforms.projector,1);gl.uniform1i(this.uniforms.presentation,0);gl.uniform1i(this.uniforms.gaussian,0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.frames[2]);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      gl.uniform1i(this.uniforms.projector,0);gl.uniform1i(this.uniforms.gaussian,1);
      let sampled=3;
      for(const horizontal of [true,false]){
        const radii=horizontal?layout.x:layout.y;
        if(!radii.some(Boolean))continue;
        this.kernels ||= new Map();
        const key=radii.join(',');let kernel=this.kernels.get(key);
        if(!kernel){kernel=app.Projection.kernel(radii);this.kernels.set(key,kernel);}
        if(this.kernel!==kernel){
          this.kernel=kernel;
          gl.uniform1fv(this.uniforms['weights[0]'],kernel.weights);
          gl.uniform1fv(this.uniforms['offsets[0]'],kernel.offsets);
          gl.uniform1i(this.uniforms.blurTapCount,kernel.count);
        }
        const target=sampled===3?4:3;
        gl.bindTexture(gl.TEXTURE_2D,this.textures[sampled]);gl.bindFramebuffer(gl.FRAMEBUFFER,this.frames[target-1]);
        gl.uniform2f(this.uniforms.blurRadius,horizontal?1/layout.width:0,horizontal?0:1/layout.height);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);sampled=target;
      }
      gl.viewport(0,0,this.width,this.height);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      gl.bindTexture(gl.TEXTURE_2D,this.textures[sampled]);gl.uniform1i(this.uniforms.gaussian,0);
      gl.uniform2f(this.uniforms.blurRadius,0,0);
      gl.uniform1i(this.uniforms.presentation,1);
      gl.uniform1i(this.uniforms.outputDither,1);
      gl.uniform1f(this.uniforms.fadeStart,this.presentationFade ?? 1);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      this.context.globalCompositeOperation='copy';
      this.context.drawImage(this.gpuCanvas,0,0);
      this.context.globalCompositeOperation='source-over';
    }
    destroy() {
      const gl=this.gl;
      this.gpuCanvas.removeEventListener('webglcontextlost',this.onLost);
      for (const frame of this.frames) gl.deleteFramebuffer(frame);
      for (const texture of this.textures) gl.deleteTexture(texture);
      for (const shader of this.shaders) gl.deleteShader(shader);
      if (this.vertices) gl.deleteBuffer(this.vertices);
      if (this.program) gl.deleteProgram(this.program);
      this.gpuCanvas.width=this.gpuCanvas.height=1;
    }
  };
})();
