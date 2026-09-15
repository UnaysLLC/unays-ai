import {mkdir,readFile,writeFile,readdir,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {isIP} from 'node:net';
export const PREVIEW_CSP="sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data: blob: https://images.unsplash.com https://images.pexels.com https://upload.wikimedia.org; font-src data: https://fonts.gstatic.com; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; frame-ancestors 'self'";
export function instrumentPreview(html){const bootstrap='<meta name="referrer" content="no-referrer"><script src="/ai/ui-20260914/preview-runtime.js?v=6"></script>';return /<head\b[^>]*>/i.test(html)?html.replace(/<head\b[^>]*>/i,match=>match+bootstrap):'<!doctype html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+bootstrap+'</head>'+html;}
export function createCodePreviews({directory,auth,readBody,json,publicUrl='https://unays.net',allowedOrigins=['https://unays.net','https://www.unays.net']}){
 const root=join(directory,'code-previews'),rates=new Map();let creating=false;
 const hash=value=>createHash('sha256').update(value).digest('hex');
 function ip(req){const peer=String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');return ['127.0.0.1','::1'].includes(peer)&&isIP(String(req.headers['x-real-ip']||''))?req.headers['x-real-ip']:peer;}
 return async(req,res,pathname)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow, nosnippet');res.setHeader('Referrer-Policy','no-referrer');
  const match=pathname.match(/\/code\/previews\/([a-f0-9]{48})(\/render)?$/);
  try{
   if(match&&['GET','HEAD'].includes(req.method)){
    let record;try{record=JSON.parse(await readFile(join(root,match[1]+'.json'),'utf8'));}catch{return json(res,404,{ok:false,error:'Preview not found.'});}
    if(record.expiresAt<Date.now())return json(res,410,{ok:false,error:'This preview link has expired. Create a new link from the coding workspace.'});
    if(match[2]){res.setHeader('Content-Security-Policy',PREVIEW_CSP);res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Type','text/html; charset=utf-8');res.statusCode=200;return res.end(req.method==='HEAD'?'':instrumentPreview(record.html));}
    return json(res,200,{ok:true,title:record.title,expiresAt:new Date(record.expiresAt).toISOString()});
   }
   if(!pathname.endsWith('/code/previews')||req.method!=='POST')return json(res,404,{ok:false,error:'Preview not found.'});
   if((req.headers.origin&&!allowedOrigins.includes(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{ok:false,error:'Create the link from your coding workspace.'});
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{ok:false,error:'A JSON request is required.'});
   const user=auth(req);if(req.headers.authorization&&!user)return json(res,401,{ok:false,error:'Please sign in again.'});if(user?.services?.ai===false)return json(res,403,{ok:false,error:'AI access is disabled for this account.'});
   const body=await readBody(req,512*1024);if(typeof body.html!=='string'||Buffer.byteLength(body.html)>500000||!/<(?:html|body|main|div|section|h1)\b/i.test(body.html))return json(res,400,{ok:false,error:'Create an HTML project under 500 KB before sharing a preview.'});
   const identity=hash(ip(req)),now=Date.now();for(const [key,r] of rates)if(r.until<now)rates.delete(key);const rate=rates.get(identity)||{n:0,until:now+3600000};if(rate.n>=30)return json(res,429,{ok:false,error:'Preview link limit reached. Try again in an hour.'});
   if(creating)return json(res,429,{ok:false,error:'Another preview is being saved. Please retry in a moment.'});creating=true;
   try{
    await mkdir(root,{recursive:true,mode:0o700});let count=0,bytes=0;
    for(const file of await readdir(root,{withFileTypes:true})){if(!file.isFile()||!/^\w{48}\.json$/.test(file.name))continue;const path=join(root,file.name),info=await stat(path);if(info.mtimeMs<now-7*86400000){await unlink(path);continue;}count++;bytes+=info.size;}
    if(count>=1024||bytes>100*1024*1024)return json(res,503,{ok:false,error:'Preview storage is temporarily full. Please try later.'});
    const id=randomBytes(24).toString('hex'),expiresAt=now+7*86400000,title=String(body.title||'Untitled project').replace(/[\x00-\x1f]/g,'').slice(0,100);
    await writeFile(join(root,id+'.json'),JSON.stringify({title,html:body.html,expiresAt,owner:hash(user?.id||identity)}),{mode:0o600,flag:'wx'});rate.n++;rates.set(identity,rate);
    return json(res,201,{ok:true,url:publicUrl+'/ai/preview/'+id,expiresAt:new Date(expiresAt).toISOString()});
   }finally{creating=false;}
  }catch(error){const status=error.statusCode===413?413:error instanceof SyntaxError?400:503;return json(res,status,{ok:false,error:status===413?'The preview is too large.':'The preview could not be saved. Please try again.'});}
 };
}
