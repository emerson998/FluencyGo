// Sons curtos de estado gerados pelo navegador, sem arquivos: "sua vez" sobe, "ouvi" é um tom só.
let ctx=null;
export function earcon(kind){
 const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
 try{ctx??=new Context();const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;
  osc.frequency.setValueAtTime(kind==='turn'?660:440,t);if(kind==='turn')osc.frequency.linearRampToValueAtTime(880,t+.12);
  gain.gain.setValueAtTime(.12,t);gain.gain.exponentialRampToValueAtTime(.001,t+.12);osc.connect(gain).connect(ctx.destination);osc.start(t);osc.stop(t+.13);}catch{}
}
