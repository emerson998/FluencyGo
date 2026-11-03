import {match} from './matcher.js';
// Máquina de estados da conversa: pura (sem React, DOM ou relógio real). Recebe eventos e devolve ações para quem a hospeda.
// Ações: play {items,turnId,filler}, stop, listen, unlisten, earcon {kind}, timer {event,id,ms}, callLive {transcript,nodeId,turnId}, save {snapshot}, done {summary}.
const SORRY={en:'Sorry, can you say that again?',es:'Perdón, ¿me lo repites?'};
const PAUSED_PT='Vamos fazer uma pausa. Quando quiser continuar, aperte Continuar ou a barra de espaço.';
export const PAUSE_DEFAULT={A1:1500,A2:1200,B1:1000};
export const MIN_SECONDS=300,MIN_TURNS=10;
export function percentile(values,p){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];}
export function createEngine({map,headset=false,stage=3,now=()=>Date.now(),nodeId,history=[],silenceMs=8000}){
 const nodes=new Map(map.nodes.map(n=>[n.id,n])),lang=map.language;
 const s={phase:'IDLE',nodeId:nodes.has(nodeId)?nodeId:map.nodes[0].id,turnId:0,offScript:0,silence:0,rotate:0,last:null,ending:false,pending:null,history:[...history],turns:[],clicks:0,bargeIns:0,corrections:0,startedAt:null,endedAt:null};
 const node=()=>nodes.get(s.nodeId);
 const say=text=>({voice:lang,text}),pt=text=>({voice:'pt',text});
 const pick=list=>list[s.rotate++%list.length];
 const remember=(role,text)=>{s.history.push({role,text});s.history=s.history.slice(-20);};
 const save=()=>({type:'save',snapshot:{nodeId:s.nodeId,history:s.history}});
 function speak(items,{end=false}={}){s.turnId++;s.phase='TUTOR_SPEAKING';s.ending=end;s.last=items;for(const i of items)if(i.voice===lang)remember('tutor',i.text);return [...(headset?[]:[{type:'unlisten'}]),{type:'play',items,turnId:s.turnId,filler:false}];}
 function listen(earcon=true){s.phase='LISTENING';return [{type:'listen'},...(earcon?[{type:'earcon',kind:'turn'}]:[]),{type:'timer',event:'silenceTimeout',id:s.turnId,ms:silenceMs}];}
 function summary(){const waits=path=>s.turns.filter(t=>path(t.path)&&t.waitMs!==null).map(t=>t.waitMs);const map_=waits(p=>p!=='live'),live=waits(p=>p==='live'),durationMs=(s.endedAt??now())-(s.startedAt??now());
  return {durationMs,turns:s.turns.length,clicks:s.clicks,bargeIns:s.bargeIns,corrections:s.corrections,offScript:s.turns.filter(t=>t.path==='live').length,mapMedianMs:percentile(map_,.5),liveMedianMs:percentile(live,.5),liveP95Ms:percentile(live,.95),stage,passed:stage===3&&durationMs>=MIN_SECONDS*1000&&s.turns.length>=MIN_TURNS&&s.clicks===0};}
 function finish(){if(s.phase==='DONE')return [];s.phase='DONE';s.endedAt=now();s.turnId++;return [{type:'stop'},{type:'unlisten'},save(),{type:'done',summary:summary()}];}
 function advance(prefix=[]){const n=node();if(n.next===null)return prefix.length?speak(prefix,{end:true}):finish();s.nodeId=n.next;return [...speak([...prefix,say(node().tutor)]),save()];}
 function recover(){s.offScript=0;return speak([say(pick(map.recovery)),say(node().tutor)]);}
 function heard(text){
  s.silence=0;remember('student',text);const t0=now(),acts=[{type:'earcon',kind:'heard'}],result=match(text,node(),map);
  const turn=path=>{s.pending={t0,path};s.turns.push({path,waitMs:null});};
  if(result.kind==='help'){turn('help');return [...acts,...speak((s.last||[say(node().tutor)]).map(i=>({...i,rate:.75})))];}
  if(result.kind==='expected'){turn('map');s.offScript=0;return [...acts,...advance()];}
  if(result.kind==='error'){turn('map');s.offScript=0;const e=result.item,items=[say(e.recast)];if(e.trained){items.push(pt(e.explain_ptbr));s.corrections++;}return [...acts,...advance(items)];}
  if(result.kind==='unclear'){turn('map');return [...acts,...speak([say(SORRY[lang])])];}
  s.offScript++;
  if(s.offScript>=3){turn('map');return [...acts,...recover()];}
  turn('live');s.phase='THINKING';
  return [...acts,...(headset?[]:[{type:'unlisten'}]),{type:'play',items:[say(pick(map.fillers))],turnId:s.turnId,filler:true},{type:'callLive',transcript:text,nodeId:s.nodeId,turnId:s.turnId}];
 }
 function reply(r){
  if(!r||r.timeout)return recover();
  const items=[];if(r.correction_ptbr){items.push(pt(r.correction_ptbr));s.corrections++;}if(r.recast)items.push(say(r.recast));items.push(say(r.say));
  if(r.backTo&&nodes.has(r.backTo))s.nodeId=r.backTo;
  return [...speak(items),save()];
 }
 function dispatch(e){
  switch(e.type){
   case 'start':if(s.phase!=='IDLE')return [];s.startedAt=now();return [...speak([say(node().tutor)]),save()];
   case 'audioStarted':if(e.turnId===s.turnId&&!e.filler&&s.pending){s.turns.at(-1).waitMs=now()-s.pending.t0;s.pending=null;}return [];
   case 'ttsEnded':if(e.turnId!==s.turnId||s.phase!=='TUTOR_SPEAKING')return [];return s.ending?finish():listen();
   // Fora de LISTENING a fala é descartada: sem fone, seria a voz do professor captada de volta.
   case 'speechFinal':if(s.phase!=='LISTENING'||!String(e.text||'').trim())return [];return heard(String(e.text).trim());
   case 'turnReply':if(e.turnId!==s.turnId||s.phase!=='THINKING')return [];return reply(e.reply);
   case 'turnTimeout':if(e.turnId!==s.turnId||s.phase!=='THINKING')return [];return recover();
   case 'silenceTimeout':
    if(e.id!==s.turnId||s.phase!=='LISTENING')return [];
    s.silence++;
    if(s.silence===1)return speak([say(node().tutor)]);
    if(s.silence===2)return speak([pt(node().hint_ptbr)]);
    s.silence=0;s.phase='PAUSED';s.turnId++;return [{type:'unlisten'},{type:'play',items:[pt(PAUSED_PT)],turnId:s.turnId,filler:true}];
   case 'bargeIn':if(!headset||s.phase!=='TUTOR_SPEAKING'||s.ending)return [];s.bargeIns++;s.turnId++;return [{type:'stop'},...listen(false)];
   case 'pause':if(s.phase==='DONE'||s.phase==='PAUSED'||s.phase==='IDLE')return [];s.phase='PAUSED';s.turnId++;return [{type:'stop'},{type:'unlisten'}];
   case 'resume':if(s.phase!=='PAUSED')return [];s.silence=0;return speak([say(node().tutor)]);
   case 'repeat':if(!['LISTENING','TUTOR_SPEAKING'].includes(s.phase))return [];return [{type:'stop'},...speak((s.last||[say(node().tutor)]).map(i=>({...i,rate:.75})))];
   case 'click':s.clicks++;return [];
   case 'exit':return finish();
   default:return [];
  }
 }
 return {dispatch,get state(){return {phase:s.phase,nodeId:s.nodeId,turnId:s.turnId,history:s.history};},summary};
}
