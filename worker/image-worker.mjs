/** Private image bridge. Bind AI and set ORIGIN_SECRET as a Worker secret. */
export default {
 async fetch(request,env){
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
  const json=(body,status=200)=>Response.json(body,{status,headers});
  const supplied=request.headers.get('Authorization')||'';
  const expected=env.ORIGIN_SECRET?'Bearer '+env.ORIGIN_SECRET:'';
  const hash=async text=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  if(!expected||!crypto.subtle.timingSafeEqual(await hash(supplied),await hash(expected)))return json({ok:false,error:'Unauthorized'},401);
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return json({ok:true});
  if(request.method!=='POST'||url.pathname!=='/generate')return json({ok:false,error:'Not found'},404);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({ok:false,error:'JSON required'},415);
  let input;
  try{
   const reader=request.body?.getReader();if(!reader)return json({ok:false,error:'Prompt required'},400);
   const chunks=[];let length=0;
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();return json({ok:false,error:'Request too large'},413);}chunks.push(value);}
   const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}input=JSON.parse(new TextDecoder().decode(bytes));
  }catch{return json({ok:false,error:'Invalid request'},400);}
  if(typeof input.prompt!=='string'||input.prompt.trim().length<3||input.prompt.length>2048)return json({ok:false,error:'Use a prompt between 3 and 2048 characters'},400);
  try{
   const response=await env.AI.run('@cf/black-forest-labs/flux-1-schnell',{prompt:input.prompt.trim(),steps:4});
   if(typeof response.image!=='string'||response.image.length<1000||response.image.length>10_000_000)return json({ok:false,error:'Image generation failed'},502);
   return json({ok:true,image:response.image,mime:'image/jpeg'});
  }catch(error){console.warn(JSON.stringify({event:'image_generation_failed',name:error?.name||'Error'}));return json({ok:false,error:'Image generation is temporarily unavailable'},503);}
 }
};
