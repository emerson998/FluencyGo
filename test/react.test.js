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
test('Scene tab: map, voice-only step, expected answer without Claude, off-script turn through live Claude, summary',async()=>{
 const {sceneMap}=await import('./fixtures/scene-map.mjs');
 const requests=[],spoken=[],recognizers=[];const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://localhost:3210',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
 const replies={'/api/status':{providers:[{name:'codex',installed:true},{name:'claude',installed:true}],acoustic:false,tts:{en:false,es:false,pt:false}},'/api/chat':{reply:'Hi',translation:'Oi',feedback:'',vocabulary:[]},'/api/scene':sceneMap,'/api/scene/live':{sceneId:'s1'},'/api/scene/turn':{say:'Yes, we do! What would you like?',correction_ptbr:'',recast:'',backTo:'n2'},'/api/scene/end':{ok:true}};
 w.fetch=async(path,opts)=>{if(opts)requests.push({path,data:JSON.parse(opts.body)});return {ok:true,json:async()=>replies[path]};};
 w.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 w.speechSynthesis={getVoices:()=>[],cancel(){},speak(u){spoken.push(u.text);setTimeout(()=>u.onend?.(),5);}};
 w.SpeechRecognition=class{constructor(){recognizers.push(this);}start(){}abort(){}stop(){}};
 const wait=async(check,ms=6000)=>{for(let i=0;i<ms/10;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Cena não atingiu o estado esperado.');};
 const say=text=>recognizers.at(-1).onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:true})]});
 const listening=()=>w.document.querySelector('.scene-state.listening')&&recognizers.at(-1)?.onresult;
 try{w.eval(bundle);await wait(()=>button(w,'Começar'));button(w,'Começar').click();await wait(()=>button(w,'Cena'));
  button(w,'Cena').click();await wait(()=>button(w,'Preparar a cena'));button(w,'Preparar a cena').click();
  await wait(()=>w.document.body.textContent.includes(sceneMap.title));assert.deepEqual(requests.find(r=>r.path==='/api/scene').data,{language:'en',level:'A1',place:'cafe'});
  button(w,'Passo 3').click();await wait(listening);
  assert.equal(spoken[0],'Hi! What would you like to drink?');assert.ok(!w.document.body.textContent.includes('What would you like to drink'));
  say('a large coffee please');await wait(()=>spoken.includes('Milk or sugar?'));assert.ok(!requests.some(r=>r.path==='/api/scene/turn'));
  await wait(listening);say('Do you have wifi in this place?');await wait(()=>spoken.includes('Yes, we do! What would you like?'));
  const turn=requests.find(r=>r.path==='/api/scene/turn').data;assert.deepEqual(turn,{sceneId:'s1',transcript:'Do you have wifi in this place?',nodeId:'n2'});
  assert.ok(spoken.includes('Hmm…'));
  await wait(listening);button(w,'Sair').click();await wait(()=>w.document.querySelector('.scene-summary'));
  assert.match(w.document.querySelector('.scene-summary').textContent,/Suas falas/);await wait(()=>requests.some(r=>r.path==='/api/scene/end'));
  assert.equal(JSON.parse(w.localStorage.getItem('fluencygo-scenes-v1')).sessions.length,1);assert.equal(w.localStorage.getItem('lingua-v1').includes('scenes'),false);
 }finally{w.close();}
});
