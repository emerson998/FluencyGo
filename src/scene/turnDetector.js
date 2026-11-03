// Escuta contínua com fim de fala por silêncio configurável. O navegador encerra a sessão sozinho de tempos em tempos: reinicia.
export function createTurnDetector({Recognition,lang,pauseMs,onFinal,onError,timers={setTimeout:(f,ms)=>setTimeout(f,ms),clearTimeout:id=>clearTimeout(id)},now=()=>Date.now()}){
 let rec=null,active=false,parts=[],interim='',timer=null,restarts=[];
 const reset=()=>{timers.clearTimeout(timer);timer=null;parts=[];interim='';};
 function flush(){timer=null;const text=[...parts,interim].join(' ').replace(/\s+/g,' ').trim();parts=[];interim='';if(text)onFinal(text);}
 function begin(){
  rec=new Recognition();rec.lang=lang;rec.continuous=true;rec.interimResults=true;
  rec.onresult=e=>{let fresh='';for(let i=e.resultIndex??0;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)parts.push(r[0].transcript.trim());else fresh+=r[0].transcript;}interim=fresh.trim();timers.clearTimeout(timer);timer=timers.setTimeout(flush,pauseMs);};
  rec.onerror=e=>{if(['not-allowed','service-not-allowed','audio-capture'].includes(e.error)){stop();onError?.('mic');}};
  rec.onend=()=>{if(!active)return;const t=now();restarts=restarts.filter(x=>t-x<60000);if(restarts.length>=5){stop();onError?.('restart');return;}restarts.push(t);try{begin();}catch{stop();onError?.('restart');}};
  rec.start();
 }
 function stop(){active=false;reset();if(rec){rec.onresult=rec.onend=rec.onerror=null;try{rec.abort();}catch{}}rec=null;}
 return {
  start(){if(active)return;active=true;reset();try{begin();}catch{stop();onError?.('mic');}},
  stop,
  // Descarta o que foi ouvido antes (ex.: durante a fala do professor) sem parar a escuta.
  reset,
  setPause(ms){pauseMs=ms;},
  get active(){return active;},
 };
}
