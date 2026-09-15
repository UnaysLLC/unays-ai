import {Script} from 'node:vm';
export function codeIssues(text){
 const issues=[];let match,index=0;
 const fences=/```([^\n]*)\n([\s\S]*?)```/g;
 while((match=fences.exec(text))&&index++<20){const info=match[1].trim().toLowerCase(),code=match[2],before=text.slice(Math.max(0,match.index-180),match.index),file=before.match(/###?\s+`?([^`\n]+)`?\s*$/)?.[1]||info||'file '+index;
  const check=(source,label)=>{try{new Script(source,{filename:String(file).slice(0,100)});}catch(error){issues.push(label+': '+String(error.message).slice(0,180));}};
  if(/^(js|javascript)(?:\s|$)|\.js$/.test(info)&&!/^\s*(?:import\s|export\s)/m.test(code))check(code,file);
  if(/^json(?:\s|$)|\.json$/.test(info)){try{JSON.parse(code);}catch{issues.push(file+': Invalid JSON.');}}
  if(/^html(?:\s|$)|\.html?$/.test(info)||/^\s*<!doctype html/i.test(code)){
   if(/<html\b/i.test(code)&&!/<\/html\s*>/i.test(code))issues.push(file+': Complete the closing HTML document.');
   const scripts=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;let script;
   while((script=scripts.exec(code))){if(/\bsrc\s*=|\btype\s*=\s*["'](?:module|application\/ld\+json|application\/json|text\/babel)/i.test(script[1]))continue;check(script[2],file+' inline JavaScript');}
  }
 }
 return issues.slice(0,10);
}
