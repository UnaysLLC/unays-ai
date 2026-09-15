import { readFileSync, existsSync } from 'node:fs';

export function codingProviders(env = process.env) {
  let keys=[];
  try {
    if (env.DAHL_API_KEYS) keys=JSON.parse(env.DAHL_API_KEYS);
    else {
      const file=env.DAHL_KEYS_FILE || '/home/unays/web/unays.net/private/ai-provider-keys.json';
      if (existsSync(file)) keys=JSON.parse(readFileSync(file,'utf8')).dahl;
    }
  } catch { console.warn('Coding provider configuration could not be read'); }
  return Array.isArray(keys) ? [...new Set(keys)].filter(k=>typeof k==='string'&&/^dahl_[A-Za-z0-9]+$/.test(k)).slice(0,10).map((key,i)=>({name:'dahl-'+(i+1),kind:'dahl',model:'MiniMaxAI/MiniMax-M2.7',url:'https://inference.dahl.global/v1/chat/completions',key})) : [];
}

// Coding stays with the configured coding service. No alternate-model fallback.
// Quota exhaustion advances to the next configured key without exposing keys or errors.
// If a stream breaks after text, request only the missing continuation on the next key.
export async function* streamCoding(primary, fallback, payload, options) {
  let partial='',failure;
  const list=primary.filter(p=>p.kind==='dahl'&&p.model==='MiniMaxAI/MiniMax-M2.7');
  for(let i=0;i<list.length;i++){
    const provider=list[i];
    if((options.cooldown.get(provider.name)||0)>Date.now())continue;
    if(provider.kind==='dahl'&&(options.cooldown.get('dahl-edge')||0)>Date.now())continue;
    let attempt='';
    try {
      const messages=partial ? [...payload.messages,{role:'assistant',content:partial},{role:'user',content:'Continue the previous answer exactly where it stopped. Do not repeat any text, headings, opening code fences, or code already present. Finish the interrupted file or sentence, then any remaining files.'}] : payload.messages;
      for await(const text of options.stream([provider],{...payload,messages},{...options,onProvider:options.onProvider})) {attempt+=text;partial+=text;yield text;}
      return;
    } catch(error){
      failure=error;
      if(options.signal?.aborted)throw error;
      // A browser challenge is an origin-wide issue, not a key quota issue.
      if(provider.kind==='dahl' && error.edgeChallenge)options.cooldown.set('dahl-edge',Date.now()+300000);
      if(error.upstreamStatus===402)options.cooldown.set(provider.name,Date.now()+3600000);
      else if(!options.cooldown.has(provider.name))options.cooldown.set(provider.name,Date.now()+15000);
    }
  }
  throw failure || Error('Coding service is temporarily unavailable');
}
