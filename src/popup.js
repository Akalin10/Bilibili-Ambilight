(() => {
  'use strict';
  const settings=globalThis.BilibiliAmbilight.settings;
  const status=document.querySelector('#status');
  const form=document.querySelector('#settings');
  form.inert=true;
  let queue=Promise.resolve();
  let draft={...settings.value};
  function render(value){
    document.documentElement.classList.toggle('ambilight-light',value.lightMode===true);
    for(const [key,n] of Object.entries(value)){
      const input=document.getElementById(key);
      if(typeof n==='boolean')input.checked=n;else input.value=n;
      const output=document.getElementById(`${key}-value`);
      if(output)output.value=key==='strength'?`${Math.round(n*100)}%`:key==='blur'?`${n.toFixed(1)}%`:
        key==='spread'?`${(n*100).toFixed(1)}%`:key==='fadeMs'?(n===0?'关闭':`${n} ms`):
        key==='fpsLimit'?`${n} FPS`:`${n.toFixed(2)}×`;
      if(input.type==='range'){
        const progress=100*(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min));
        input.style.setProperty('--progress',`${progress}%`);
        input.setAttribute('aria-valuetext',output.value);
      }
    }
  }
  function save(patch){
    status.textContent='正在保存…';
    queue=queue.then(()=>settings.update(patch)).then(()=>{status.textContent='已保存';})
      .catch(()=>{status.textContent='保存失败，请重试';});
  }
  form.addEventListener('submit',event=>event.preventDefault());
  form.addEventListener('change',event=>{
    const input=event.target;
    if(!Object.hasOwn(settings.defaults,input.id))return;
    const value=input.type==='checkbox'?input.checked:input.id==='quality'?input.value:Number(input.value);
    draft[input.id]=value;render(draft);save({[input.id]:value});
  });
  form.addEventListener('input',event=>{
    const input=event.target;
    if(input.type==='range'){draft[input.id]=Number(input.value);render(draft);}
  });
  document.querySelector('#reset').addEventListener('click',()=>{draft={...settings.defaults};render(draft);save(settings.defaults);});
  settings.ready.then(()=>{draft={...settings.value};render(draft);form.inert=false;status.textContent='';});
})();
