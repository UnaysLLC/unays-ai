import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {streamCoding} from '../src/coding-provider.mjs';
import {createImageStudio} from '../src/image-studio.mjs';
import {GuestLedger,createChatGateway} from '../src/chat-gateway.mjs';
import {createApp,publicPath,readBody,json} from '../server.mjs';
const p=n=>({name:'key-'+n,kind:'dahl',model:'MiniMaxAI/MiniMax-M2.7'});
const collect=async iterator=>{let s='';for await(const text of iterator)s+=text;return s;};
test('Quota exhaustion rotates keys; an unrelated fallback is never called',async()=>{
 const calls=[];const result=await collect(streamCoding([p(1),p(2)],[{name:'wrong-provider'}],{messages:[{role:'user',content:'Build a page'}]},{cooldown:new Map(),stream:async function*(providers){calls.push(providers[0].name);if(providers[0].name==='key-1')throw Object.assign(Error('quota'),{upstreamStatus:402});yield 'complete project';}}));
 assert.deepEqual(calls,['key-1','key-2']);assert.equal(result,'complete project');
});
test('Interrupted code continues on the next key without discarding previous output',async()=>{
 const payloads=[];const result=await collect(streamCoding([p(1),p(2)],[],{messages:[{role:'user',content:'Build'}]},{cooldown:new Map(),stream:async function*(providers,payload){payloads.push(payload);if(providers[0].name==='key-1'){yield 'first half';throw Error('interrupted');}yield ' second half';}}));
 assert.equal(result,'first half second half');assert.equal(payloads[1].messages.at(-2).content,'first half');assert.match(payloads[1].messages.at(-1).content,/Do not repeat/);
});
test('All exhausted keys return failure and do not use an alternate model',async()=>{
 const calls=[],cooldown=new Map();await assert.rejects(()=>collect(streamCoding([p(1),p(2),{...p(3),model:'other'}],[{name:'fallback'}],{messages:[]},{cooldown,stream:async function*(providers){calls.push(providers[0].name);throw Object.assign(Error('quota'),{upstreamStatus:402});}})),/quota/);
 assert.deepEqual(calls,['key-1','key-2']);assert(cooldown.get('key-1')>Date.now());
});
test('An origin-wide challenge does not hammer the remaining keys',async()=>{
 let calls=0;await assert.rejects(()=>collect(streamCoding([p(1),p(2)],[],{messages:[]},{cooldown:new Map(),stream:async function*(){calls++;throw Object.assign(Error('challenge'),{edgeChallenge:true});}})));assert.equal(calls,1);
});
async function imageHarness(t,fetchImpl,options={}){
 const directory=await mkdtemp(join(tmpdir(),'unays-image-test-'));const ledger=new GuestLedger(directory);
 const handler=createImageStudio({directory,ledger,auth:()=>null,authToken:()=>'',readBody,json,fetchImpl,env:{IMAGE_SERVICE_URL:'https://private.invalid/generate',IMAGE_SERVICE_SECRET:'test-only-secret'},allowedOrigins:['http://localhost'],...options});
 const server=http.createServer((req,res)=>handler(req,res,req.url==='/access'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});});
 return {url:'http://127.0.0.1:'+server.address().port,ledger,post:body=>({method:'POST',headers:{'content-type':'application/json',origin:'http://localhost'},body:JSON.stringify(body)})};
}
const jpeg='/9j/'+Buffer.alloc(1200).toString('base64');
test('Image success commits one guest question and returns no provider metadata',async t=>{
 let upstream;const h=await imageHarness(t,async(url,options)=>{upstream=options;return Response.json({ok:true,image:jpeg,mime:'image/jpeg'});});const res=await fetch(h.url,h.post({prompt:'A detailed science illustration',style:'diagram'}));const body=await res.json();assert.equal(res.status,200);assert.equal(body.guest.used,1);assert.match(body.image.dataUrl,/^data:image\/jpeg;base64,/);assert.equal(body.image.style,'diagram');assert.equal(body.model,undefined);assert.match(JSON.parse(upstream.body).prompt,/Avoid text labels/);assert.match(res.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
});
test('Failed image generation never consumes a guest question',async t=>{
 const h=await imageHarness(t,async()=>new Response('unavailable',{status:503}));const res=await fetch(h.url,h.post({prompt:'A golden robot'}));assert.equal(res.status,503);assert.equal((await res.json()).guest.used,0);assert.equal(h.ledger.pending.size,0);
});
test('Image endpoint rejects cross-origin requests before contacting provider',async t=>{
 let called=false;const h=await imageHarness(t,async()=>{called=true;return Response.json({});});const req=h.post({prompt:'A golden robot'});req.headers.origin='https://evil.example';const res=await fetch(h.url,req);assert.equal(res.status,403);assert.equal(called,false);
});
test('Malformed image output does not charge quota',async t=>{
 const h=await imageHarness(t,async()=>Response.json({mime:'text/html',image:'<script>alert(1)</script>'}));const res=await fetch(h.url,h.post({prompt:'A robot'}));assert.equal(res.status,503);assert.equal((await res.json()).guest.used,0);
});
test('Daily shared capacity stops requests before contacting the image service',async t=>{
 let called=false;const h=await imageHarness(t,async()=>{called=true;return Response.json({});},{dailyLimit:0});const res=await fetch(h.url,h.post({prompt:'A robot'}));assert.equal(res.status,429);assert.equal(called,false);
});
test('Guest reservations coordinate chat and images and survive restart',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'unays-ledger-'));t.after(()=>rm(directory,{recursive:true,force:true}));const ledger=new GuestLedger(directory),id=ledger.identify({headers:{}},{setHeader(){}},'127.0.0.1'),hold=ledger.reserve(id);assert.throws(()=>ledger.reserve(id),/current answer/);hold.commit();hold.release();assert.equal(new GuestLedger(directory).status(id).used,1);
});
test('Public file resolution rejects traversal, dotfiles and Windows separators',()=>{
 const root=join(tmpdir(),'unays-public');for(const s of ['/../secret','/%2e%2e/secret','/.env','/ai/..%5csecret','/ai/%00x'])assert.equal(publicPath(s,root),null);assert.equal(publicPath('/ai/index.html',root),join(root,'ai','index.html'));
});
test('Community server serves the workspace and protects server source and account routes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'unays-server-'));const app=await createApp({DATA_DIR:directory,PORT:'3088',PUBLIC_URL:'http://localhost:3088',OWNER_PASSWORD:'a-long-test-password-only'});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>app.close(resolve));await rm(directory,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.address().port;
 assert.equal((await fetch(base+'/ai/')).status,200);assert.equal((await fetch(base+'/server.mjs')).status,404);assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/ai/api/chats')).status,401);
 const login=await fetch(base+'/ai/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({login:'owner',password:'a-long-test-password-only'})});assert.equal(login.status,200);const {token}=await login.json();assert.equal((await fetch(base+'/ai/api/auth/me',{headers:{Authorization:'Bearer '+token}})).status,200);
});
