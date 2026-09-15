import {readFileSync,existsSync,mkdirSync,writeFileSync,renameSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';

export const IMAGE_STYLES={natural:'Natural composition with thoughtful lighting and rich detail.',illustration:'A polished editorial illustration, clear composition, detailed shapes and harmonious colors.',photographic:'A convincing photograph, physically plausible lighting, careful framing and natural textures.',cinematic:'Cinematic lighting, a striking composition, atmospheric depth and deliberate color grading.',diagram:'A clean educational visual illustration with precise shapes, uncluttered composition and a plain background. Avoid text labels.'};
const error=(status,message)=>Object.assign(Error(message),{status});
const sha=value=>createHash('sha256').update(value).digest('hex');
export function createImageStudio({directory,ledger,auth,authToken,readBody,json,moderate=()=>false,env=process.env,fetchImpl=fetch,allowedOrigins=['https://unays.net','https://www.unays.net'],dailyLimit=100}){
 let config={};
 try{const path=env.IMAGE_CONFIG_FILE||'/home/unays/web/unays.net/private/ai-image-provider.json';if(existsSync(path))config=JSON.parse(readFileSync(path,'utf8'));}catch{console.warn('Image configuration unavailable');}
 config={url:env.IMAGE_SERVICE_URL||config.url,key:env.IMAGE_SERVICE_SECRET||config.key};
 const root=join(directory,'image-usage');mkdirSync(root,{recursive:true,mode:0o700});const quotaPath=join(root,'daily.json');let quota={day:'',used:0};try{quota=JSON.parse(readFileSync(quotaPath,'utf8'));}catch{}
 const pending=new Set(),rates=new Map();let globalPending=0;
 function persist(){const temp=quotaPath+'.tmp';writeFileSync(temp,JSON.stringify(quota),{mode:0o600});chmodSync(temp,0o600);renameSync(temp,quotaPath);}
 function ip(req){const peer=String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');const real=String(req.headers['x-real-ip']||'');return ['127.0.0.1','::1'].includes(peer)&&isIP(real)?real:peer;}
 function rate(id,max,period){const now=Date.now();for(const [key,row] of rates)if(row.until<now)rates.delete(key);const r=rates.get(id)||{n:0,until:now+period};if(r.n>=max)throw error(429,'Please give image generation a little time before trying again.');r.n++;rates.set(id,r);}
 return async(req,res,accessOnly=false)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
  let reservation,identity,held=false,guest;
  const controller=new AbortController(),close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
  try{
   if((req.headers.origin&&!allowedOrigins.includes(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site')throw error(403,'Open Unays AI directly to generate an image.');
   const user=auth(req);if(!user&&authToken(req))throw error(401,'Please sign in again.');if(user?.services?.ai===false)throw error(403,'AI access is disabled for this account.');
   if(accessOnly)return json(res,200,{ok:true,available:!!(config.url&&config.key),styles:Object.keys(IMAGE_STYLES)});
   if(req.method!=='POST')throw error(405,'Use a POST request.');
   if(!String(req.headers['content-type']||'').startsWith('application/json'))throw error(415,'A JSON request is required.');
   if(!config.url||!config.key)throw error(503,'Image generation is not configured. Please try again later.');
   const input=await readBody(req,12*1024);const prompt=typeof input.prompt==='string'?input.prompt.trim():'';
   if(prompt.length<3||prompt.length>1800)throw error(400,'Describe your image using 3 to 1,800 characters.');
   const style=Object.hasOwn(IMAGE_STYLES,input.style)?input.style:'natural';
   if(moderate(prompt)||/\b(?:child porn|sexual minors?|nude child|explicit sex|hardcore porn|graphic gore)\b/i.test(prompt))throw error(400,'Please choose a non-explicit image idea appropriate for this learning workspace.');
   const day=new Date().toISOString().slice(0,10);if(quota.day!==day)quota={day,used:0};
   if(quota.used+globalPending>=dailyLimit)throw error(429,'Today’s shared image capacity has been reached. Please try again tomorrow.');
   if(!user)guest=ledger.identify(req,res,ip(req));identity=user?'u:'+user.id:'g:'+guest;
   if(pending.has(identity))throw error(429,'Your current image is still being created.');if(globalPending>=2)throw error(429,'The image studio is busy. Please try again in a moment.');
   rate('ip:'+sha(ip(req)),3,60000);rate(identity,user?12:6,3600000);
   if(guest)reservation=ledger.reserve(guest);pending.add(identity);globalPending++;held=true;
   const response=await fetchImpl(config.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.key},body:JSON.stringify({prompt:prompt+'\n'+IMAGE_STYLES[style]}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(85000)])});
   if(!response.ok){await response.body?.cancel();throw error(503,'The image service could not finish this image. Please try again.');}
   const reader=response.body.getReader(),parts=[];let length=0;
   while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>10_500_000){await reader.cancel();throw error(503,'The image could not be delivered. Please retry.');}parts.push(value);}
   const result=JSON.parse(Buffer.concat(parts).toString('utf8'));
   if(result.ok===false||result.mime!=='image/jpeg'||typeof result.image!=='string'||!/^\/9j\//.test(result.image)||!/^[A-Za-z0-9+/]+={0,2}$/.test(result.image)||result.image.length<1000)throw error(503,'No usable image was returned. Please try again.');
   quota.used++;persist();reservation?.commit();
   return json(res,200,{ok:true,image:{id:randomUUID(),dataUrl:'data:image/jpeg;base64,'+result.image,mime:'image/jpeg',prompt,style,createdAt:new Date().toISOString()},guest:guest?ledger.status(guest):null});
  }catch(e){if(controller.signal.aborted||res.destroyed)return;const status=e.status||e.statusCode||503;return json(res,status,{ok:false,error:status<500?e.message:'Image generation could not finish. Please retry; unfinished images do not use a guest question.',retryable:status===429||status>=500,guest:guest?ledger.status(guest):undefined});}
  finally{reservation?.release();if(held){pending.delete(identity);globalPending--;}controller.abort();res.off('close',close);}
 };
}
