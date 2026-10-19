import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const bundle=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
async function until(check){for(let i=0;i<150;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Interface não atingiu o estado esperado.');}
function button(window,text){return [...window.document.querySelectorAll('button')].find(b=>b.textContent.includes(text));}
test('React onboarding, chat, pronunciation guide and recorded transcript stay connected to chosen CLI',async()=>{
 const requests=[];const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:3210',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 w.fetch=async(path,opts)=>{const data=opts?JSON.parse(opts.body):null;if(data)requests.push({path,data});return {ok:true,json:async()=>path==='/api/status'?{providers:[{name:'codex',installed:true}],acoustic:false}:path==='/api/chat'?{reply:'<img src=x onerror=alert(1)>',translation:'Olá',feedback:'Vamos praticar.',vocabulary:[]}:{source:data.mode==='guide'?'guide':'transcript-only',transcript:data.transcript||'',scores:null,words:[],coaching:{ipa:'/test/',explanation:'Pratique com calma.',exercise:'Repita devagar.',textMatch:data.mode==='guide'?'não avaliado':'coincide'}}};};
 w.SpeechRecognition=class {start(){setTimeout(()=>{this.onresult?.({results:[[{transcript:'I would like a cup of coffee, please.'}]]});this.onend?.();},15);}stop(){this.onend?.();}abort(){}};
 try{w.eval(bundle);await until(()=>button(w,'Começar'));w.document.querySelector('input[value="claude"]').click();button(w,'Começar').click();await until(()=>w.document.querySelector('.turn.assistant'));assert.equal(requests[0].data.provider,'claude');assert.match(w.document.querySelector('.turn.assistant').textContent,/<img/);assert.equal(w.document.querySelectorAll('.turn img').length,0);
 button(w,'Pronúncia e fonética').click();await until(()=>button(w,'Ver fonética'));button(w,'Ver fonética').click();await until(()=>w.document.querySelector('.ipa'));assert.equal(requests.at(-1).data.mode,'guide');assert.equal(requests.at(-1).data.provider,'claude');assert.ok(!w.document.querySelector('.scores'));
 await until(()=>!button(w,'Falar minha tentativa').disabled);button(w,'Falar minha tentativa').click();await until(()=>w.document.querySelector('.notice'));assert.match(w.document.querySelector('.notice').textContent,/pronúncia não foi avaliada/);assert.equal(requests.at(-1).data.mode,'transcript');assert.equal(requests.at(-1).data.transcript,'I would like a cup of coffee, please.');assert.ok(!w.document.querySelector('.scores'));
 const audioRadio=[...w.document.querySelectorAll('.mode input')][1];audioRadio.click();await until(()=>button(w,'Falar minha tentativa').disabled);assert.match(w.document.body.textContent,/AZURE_SPEECH_KEY/);
 }finally{w.close();}
});
