// Encoder WAV PCM mono de 16 bits: testável sem dispositivos físicos.
export function encodeWav(samples, rate=16000) {
 const buffer=new ArrayBuffer(44+samples.length*2), v=new DataView(buffer);
 const str=(i,s)=>{for(let j=0;j<s.length;j++)v.setUint8(i+j,s.charCodeAt(j));};
 str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,s<0?s*32768:s*32767,true);}return buffer;
}
export async function wavFromBlob(blob) {
 const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw new Error('Este navegador não suporta conversão de áudio.');
 const ctx=new Context();try{const input=await ctx.decodeAudioData(await blob.arrayBuffer());if(input.duration>30.5)throw new Error('Grave no máximo 30 segundos.');
 const offline=new OfflineAudioContext(1,Math.ceil(input.duration*16000),16000);const source=offline.createBufferSource();source.buffer=input;source.connect(offline.destination);source.start();const audio=await offline.startRendering();const wav=encodeWav(audio.getChannelData(0));let binary='';const bytes=new Uint8Array(wav);for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);
 }finally{await ctx.close();}
}
