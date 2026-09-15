(() => {
 'use strict';
 for(const name of ['localStorage','sessionStorage']){try{window[name].getItem('__test__');}catch{const values=new Map();Object.defineProperty(window,name,{value:{get length(){return values.size},key:n=>Array.from(values.keys())[n]??null,getItem:key=>values.get(String(key))??null,setItem(key,value){key=String(key);value=String(value);if(key.length+value.length>100000||values.size>100)throw Error('Preview storage limit reached');values.set(key,value)},removeItem:key=>values.delete(String(key)),clear:()=>values.clear()},configurable:false});}}
 const send=(level,args)=>{try{parent.postMessage({type:'unays-console',level,message:args.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ').slice(0,3000)},'*');}catch{}};
 for(const level of ['log','warn','error','info']){const original=console[level];console[level]=(...args)=>{send(level,args);original.apply(console,args)};}
 addEventListener('error',event=>send('error',[event.message||'A preview resource could not load.']));addEventListener('unhandledrejection',event=>send('error',[String(event.reason)]));
 function audit(){const broken=[...document.images].filter(img=>img.complete&&!img.naturalWidth).map(img=>String(img.currentSrc||img.src).slice(0,250)).slice(0,6),overflow=document.documentElement.scrollWidth>innerWidth+2;parent.postMessage({type:'unays-preview-audit',width:innerWidth,overflow,brokenImages:broken,imageCount:document.images.length},'*');}
 addEventListener('load',()=>{audit();setTimeout(audit,1500);});addEventListener('resize',audit);document.addEventListener('error',e=>{if(e.target?.tagName==='IMG')audit();},true);
 send('info',['Preview ready. Photos and fonts are supported. Storage resets on each run.']);
})();
