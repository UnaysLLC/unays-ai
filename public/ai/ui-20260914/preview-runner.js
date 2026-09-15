(() => {
 const expected=location.origin;
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==expected||event.data?.type!=='unays-render'||typeof event.data.html!=='string'||event.data.html.length>500000)return;
  const bootstrap='<meta name="referrer" content="no-referrer"><script src="/ai/ui-20260914/preview-runtime.js?v=6"><\/script>',source=event.data.html;
  const html=/<head\b[^>]*>/i.test(source)?source.replace(/<head\b[^>]*>/i,match=>match+bootstrap):'<!doctype html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+bootstrap+'</head>'+source;
  document.open();document.write(html);document.close();
 },{once:true});
})();
