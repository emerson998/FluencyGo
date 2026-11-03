// Interrupção do professor: energia do microfone (com cancelamento de eco) acima do ruído calibrado por holdMs seguidos.
export function createLevelGate({floorDb=-60,marginDb=12,holdMs=300,stepMs=20}={}){
 let above=0;
 return {
  set floor(db){floorDb=db;},get floor(){return floorDb;},
  reset(){above=0;},
  feed(db){if(db>floorDb+marginDb){above+=stepMs;if(above>=holdMs){above=0;return true;}}else above=0;return false;},
 };
}
export async function createBargeIn({mediaDevices=navigator.mediaDevices,AudioContext=window.AudioContext||window.webkitAudioContext,onBargeIn,stepMs=20}){
 const stream=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
 const ctx=new AudioContext(),analyser=ctx.createAnalyser();analyser.fftSize=1024;ctx.createMediaStreamSource(stream).connect(analyser);
 const buffer=new Float32Array(analyser.fftSize),gate=createLevelGate({stepMs});
 const level=()=>{analyser.getFloatTimeDomainData(buffer);let sum=0;for(const v of buffer)sum+=v*v;return 10*Math.log10(sum/buffer.length+1e-12);};
 let armed=false;
 const loop=setInterval(()=>{if(armed&&gate.feed(level())){armed=false;onBargeIn();}},stepMs);
 return {
  async calibrate(ms=2000){const values=[];await new Promise(resolve=>{const t=setInterval(()=>{values.push(level());if(values.length*stepMs>=ms){clearInterval(t);resolve();}},stepMs);});gate.floor=values.reduce((a,b)=>a+b,0)/values.length;return gate.floor;},
  arm(){armed=true;gate.reset();},
  disarm(){armed=false;gate.reset();},
  close(){clearInterval(loop);stream.getTracks().forEach(t=>t.stop());ctx.close().catch(()=>{});},
 };
}
