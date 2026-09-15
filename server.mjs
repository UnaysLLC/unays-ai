import http from 'node:http';
import {readFile,mkdir,writeFile,rename,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {createChatGateway,GuestLedger} from './src/chat-gateway.mjs';
import {createImageStudio} from './src/image-studio.mjs';
import {createCodePreviews,PREVIEW_CSP} from './src/code-previews.mjs';

export const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
export function publicPath(pathname,root){
 let decoded;try{decoded=decodeURIComponent(pathname);}catch{return null;}
 if(decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(p=>p==='..'||p.startsWith('.')))return null;
 const full=resolve(root,'.'+decoded);return full.startsWith(resolve(root)+sep)?full:null;
}
export async function readBody(req,limit=512*1024){let total=0;const chunks=[];for await(const chunk of req){total+=chunk.length;if(total>limit)throw Object.assign(Error('Request is too large.'),{status:413,statusCode:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Object.assign(Error('Invalid JSON request.'),{status:400});}}
export function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});res.end(JSON.stringify(data));}
const hash=s=>createHash('sha256').update(String(s)).digest();
const equal=(a,b)=>timingSafeEqual(hash(a),hash(b));
export async function createApp(env=process.env){
 const port=Number(env.PORT||3088),publicUrl=env.PUBLIC_URL||'http://localhost:'+port,origin=new URL(publicUrl).origin;
 const root=resolve(fileURLToPath(new URL('./public',import.meta.url))),directory=resolve(env.DATA_DIR||'./data');await mkdir(directory,{recursive:true,mode:0o700});
 const sessions=new Map(),attempts=new Map(),owner={id:'owner',username:env.OWNER_USERNAME||'owner',profile:{displayName:'My workspace'},services:{ai:true}};
 const password=env.OWNER_PASSWORD||'';if(password&&password.length<16)throw Error('OWNER_PASSWORD must contain at least 16 characters.');
 const authToken=req=>String(req.headers.authorization||'').replace(/^Bearer /,'');
 const auth=req=>{const s=sessions.get(authToken(req));return s&&s>Date.now()?owner:null;};
 const ledger=new GuestLedger(resolve(directory,'guest-chat')),common={directory,auth,authToken,readBody,json,env,allowedOrigins:[origin],ledger};
 const chat=createChatGateway({...common,logPrompt:()=>{},moderate:()=>false,safetyReply:()=>''});
 const images=createImageStudio(common),previews=createCodePreviews({...common,publicUrl:origin});
 let chats=[];const chatsPath=resolve(directory,'owner-chats.json');try{chats=JSON.parse(await readFile(chatsPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 let writing=Promise.resolve();async function saveChats(){const body=JSON.stringify(chats);writing=writing.catch(()=>{}).then(async()=>{await writeFile(chatsPath+'.tmp',body,{mode:0o600});await rename(chatsPath+'.tmp',chatsPath);});await writing;}
 return http.createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',CSP);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(self), geolocation=()');
  try{
   const url=new URL(req.url,publicUrl),path=url.pathname;
   if(path==='/healthz')return json(res,200,{ok:true});
   if(path.startsWith('/ai/api/')){
    // This server only trusts its own configured origin. Proxy deployments must overwrite forwarding headers.
    delete req.headers['x-real-ip'];
    if((req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site')return json(res,403,{ok:false,error:'Open your own Unays AI instance to continue.'});
    if(path==='/ai/api/chat/access'&&req.method==='GET')return chat(req,res,true);
    if(path==='/ai/api/chat'&&req.method==='POST')return chat(req,res);
    if(path==='/ai/api/images/access'&&req.method==='GET')return images(req,res,true);
    if(path==='/ai/api/images/generate')return images(req,res);
    if(path.startsWith('/ai/api/code/previews'))return previews(req,res,path);
    if(path==='/ai/api/auth/config')return json(res,200,{ok:true,google:{enabled:false}});
    if(path==='/ai/api/auth/login'&&req.method==='POST'){
     const ip=req.socket.remoteAddress,now=Date.now();for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);const rate=attempts.get(ip)||{n:0,until:now+900000};attempts.set(ip,rate);if(++rate.n>10)return json(res,429,{ok:false,error:'Please wait 15 minutes before trying again.'});
     const body=await readBody(req,4096);if(!password||!equal(body.password,password)||!equal(body.login,owner.username))return json(res,401,{ok:false,error:'Sign-in details were not accepted. This community server uses the owner account configured in .env.'});
     for(const [k,expiry]of sessions)if(expiry<now)sessions.delete(k);if(sessions.size>=1000)return json(res,429,{ok:false,error:'Too many active sessions.'});const token=randomBytes(32).toString('hex');sessions.set(token,now+12*3600000);return json(res,200,{ok:true,user:owner,token});
    }
    if(path==='/ai/api/auth/logout'&&req.method==='POST'){sessions.delete(authToken(req));return json(res,200,{ok:true});}
    if(path==='/ai/api/auth/me')return json(res,auth(req)?200:401,auth(req)?{ok:true,user:owner}:{ok:false,error:'Sign in to your owner account.'});
    if(!auth(req))return json(res,401,{ok:false,error:'Sign in with the owner account configured for this instance. Public registration and team accounts are available on unays.net.'});
    if(path==='/ai/api/chats'&&req.method==='GET')return json(res,200,{ok:true,chats});
    if(path==='/ai/api/projects'&&req.method==='GET')return json(res,200,{ok:true,projects:[]});
    if(path==='/ai/api/chats'&&req.method==='POST'){
     const b=await readBody(req,2*1024*1024);if(typeof b.id!=='string'||b.id.length>80||!Array.isArray(b.messages)||b.messages.length>200||b.projectId)return json(res,400,{ok:false,error:'Invalid personal conversation.'});
     if(b.workspaceFiles&&(typeof b.workspaceFiles!=='object'||Array.isArray(b.workspaceFiles)||Object.keys(b.workspaceFiles).length>100||Object.values(b.workspaceFiles).some(v=>typeof v!=='string')))return json(res,400,{ok:false,error:'Invalid workspace files.'});
     const old=chats.find(c=>c.id===b.id),now=new Date().toISOString();const row={id:b.id,title:String(b.title||'Untitled').slice(0,120),mode:['coder','general','business','educational'].includes(b.mode)?b.mode:'general',messages:b.messages.filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content.slice(0,150000)})),workspaceFiles:b.workspaceFiles||{},userId:owner.id,createdAt:old?.createdAt||now,updatedAt:now};
     chats=[row,...chats.filter(c=>c.id!==row.id)].slice(0,100);await saveChats();return json(res,200,{ok:true,chat:row});
    }
    if(path==='/ai/api/chats/delete'&&req.method==='POST'){const b=await readBody(req,4096);chats=chats.filter(c=>c.id!==b.id);await saveChats();return json(res,200,{ok:true});}
    return json(res,501,{ok:false,error:'This integration is not included in the community starter. Use the hosted workspace for team accounts, document extraction and server-side program execution. Browser coding previews, projects, notes and images are available here.'});
   }
   if(!['GET','HEAD'].includes(req.method))return json(res,405,{ok:false,error:'Method not allowed.'});
   if(path==='/'){res.writeHead(302,{Location:'/ai/'});return res.end();}
   if(path==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('User-agent: *\nDisallow: /\n');}
   const routes={'/ai':'/ai/index.html','/ai/':'/ai/index.html','/ai/code':'/ai/code.html','/ai/profile':'/ai/profile.html','/ai/code-preview':'/ai/code-preview.html'};
   const actual=/^\/ai\/preview\/[a-f0-9]{48}$/.test(path)?'/ai/shared-preview.html':routes[path]||path;
   const file=publicPath(actual,root);if(!file)return json(res,404,{ok:false,error:'Not found.'});
   let info;try{info=await stat(file);}catch{return json(res,404,{ok:false,error:'Not found.'});}if(!info.isFile())return json(res,404,{ok:false,error:'Not found.'});
   const ext=extname(file),types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json','.txt':'text/plain'};
   if(actual==='/ai/code-preview.html')res.setHeader('Content-Security-Policy',PREVIEW_CSP);
   res.setHeader('X-Robots-Tag','noindex, nofollow');res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-store':'public, max-age=3600'});res.end(req.method==='HEAD'?'':await readFile(file));
  }catch(e){if(!res.headersSent)json(res,e.status||500,{ok:false,error:e.status?e.message:'The request could not be completed.'});else res.end();}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const app=await createApp();app.requestTimeout=100000;app.headersTimeout=20000;app.listen(Number(process.env.PORT||3088),process.env.HOST||'127.0.0.1',()=>console.log('Unays AI ready at '+(process.env.PUBLIC_URL||'http://localhost:'+(process.env.PORT||3088))+'/ai/'));}
