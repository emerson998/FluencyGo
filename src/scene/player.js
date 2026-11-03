// Toca as falas da cena em sequência, com áudio do Piper gerado antes quando possível; sem Piper, usa a voz do navegador.
export const LANGS={en:'en-US',es:'es-MX',pt:'pt-BR'};
export function createPlayer({fetchAudio,speak,tts={},Audio=window.Audio,createURL=b=>URL.createObjectURL(b),revokeURL=u=>URL.revokeObjectURL(u),cancelSpeech=()=>window.speechSynthesis?.cancel()}){
 const cache=new Map();let token=0,current=null,disposed=false;
 const key=item=>`${item.voice}\0${item.text}`;
 function url(item){const k=key(item);if(!cache.has(k))cache.set(k,fetchAudio(item).then(createURL).catch(e=>{cache.delete(k);throw e;}));return cache.get(k);}
 async function preload(items,limit=4){const queue=items.filter(i=>tts[i.voice]);await Promise.all(Array.from({length:limit},async()=>{while(queue.length&&!disposed){const item=queue.shift();try{await url(item);}catch{}}}));}
 function stopCurrent(){if(current){current.onended=current.onerror=current.onplaying=null;current.pause();current=null;}cancelSpeech();}
 // started: chamado quando o som começa de fato (para medir a espera do aluno), não quando o pedido sai.
 async function playOne(item,mine,started){
  if(tts[item.voice]){
   try{const src=await url(item);if(mine!==token)return;await new Promise(resolve=>{const audio=new Audio(src);current=audio;audio.playbackRate=item.rate||1;audio.onplaying=started;audio.onended=audio.onerror=()=>resolve();audio.play().catch(()=>resolve());});return;}
   catch{if(mine!==token)return;}
  }
  await speak(item.text,item.voice,{lang:LANGS[item.voice],rate:item.rate?item.rate*.9:.9,onStart:started});
 }
 return {
  preload,
  // Resolve true se tocou tudo, false se foi interrompido por stop() ou por outro play().
  async play(items,{onStart}={}){const mine=++token;stopCurrent();let fired=false;const started=()=>{if(!fired&&mine===token){fired=true;onStart?.();}};for(const item of items){if(mine!==token)return false;await playOne(item,mine,started);}if(mine===token)current=null;return mine===token;},
  stop(){token++;stopCurrent();},
  dispose(){disposed=true;token++;stopCurrent();for(const p of cache.values())p.then(revokeURL,()=>{});cache.clear();},
 };
}
