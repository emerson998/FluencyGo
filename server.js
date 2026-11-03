import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { evaluateSpeech, speechConfigured, validateSpeech } from './speech.js';
import { teach, runProcess, providers, validate } from './provider.js';
import { buildScene, validateSceneRequest } from './scene.js';
import { LiveTutor, validateLiveOpen, validateTurnRequest } from './live.js';
import { createSynth, ttsConfigured, validateTts } from './tts.js';
const files = {'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const invalid = 'Dados inválidos. Confira idioma, nível e histórico.';
export function createApp({ teacher = teach, runner = runProcess, evaluator = evaluateSpeech, scener = buildScene, live = new LiveTutor(), synth = createSynth(), env = process.env } = {}) {
 let busy = false;
 // lock: usa a trava única das gerações por chamada (chat, pronúncia, mapa). O Claude aberto da cena e a voz têm fila própria.
 const routes = {
  'POST /api/chat': { limit: 64000, check: validate, run: d => teacher(d), lock: true, invalid },
  'POST /api/speech': { limit: 1400000, check: validateSpeech, run: d => evaluator(d), lock: true, invalid },
  'POST /api/scene': { limit: 8000, check: validateSceneRequest, run: d => scener(d), lock: true },
  'POST /api/scene/live': { limit: 64000, check: validateLiveOpen, run: d => live.open(d) },
  'POST /api/scene/turn': { limit: 4000, check: validateTurnRequest, run: (d, signal) => live.turn(d, { signal }) },
  'POST /api/scene/end': { limit: 1000, check: d => { if (!d || (d.sceneId !== undefined && (typeof d.sceneId !== 'string' || d.sceneId.length > 64))) throw new Error('Cena inválida.'); return d; }, run: d => ({ ok: true, closed: live.close(d.sceneId) }) },
  'POST /api/tts': { limit: 4000, check: validateTts, run: (d, signal) => synth(d, { signal }), binary: 'audio/wav' },
 };
 return createServer(async (req,res) => {
  const send = (status,value) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const address = req.headers.host;
  if (address !== `127.0.0.1:${res.socket.localPort}` && address !== `localhost:${res.socket.localPort}`) return send(403,{error:'Host não permitido.'});
  if (req.headers.origin && ![`http://127.0.0.1:${res.socket.localPort}`,`http://localhost:${res.socket.localPort}`].includes(req.headers.origin)) return send(403,{error:'Origem não permitida.'});
  req.url = req.url.split('?')[0];
  if (req.method === 'GET' && req.url === '/api/status') {
    const status = await Promise.all(providers.map(async name => { try { const version = await runner(name,['--version'],'',{timeout:5000}); return {name,installed:true,version:version.slice(0,100)}; } catch { return {name,installed:false}; } }));
    return send(200,{providers:status,acoustic:speechConfigured(),tts:ttsConfigured(env),live:live.status(),note:'Instalação detectada; autenticação é confirmada na primeira conversa.'});
  }
  const route = routes[`${req.method} ${req.url}`];
  if (route) {
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'Envie JSON.'});
    if (route.lock && busy) return send(429,{error:'Aguarde a resposta atual antes de enviar outra mensagem.'});
    // Marca antes de ler o corpo: duas requisições simultâneas não podem passar pela checagem.
    if (route.lock) busy = true;
    const aborted = new AbortController();
    res.on('close', () => { if (!res.writableEnded) aborted.abort(); });
    const chunks = []; let size = 0;
    try {
      // Junta bytes, não texto: um acento dividido entre dois pedaços viraria lixo.
      for await (const chunk of req) { size += chunk.length; if (size > route.limit) { send(413,{error:'Mensagem muito grande.'}); return; } chunks.push(chunk); }
      let data; try { data = route.check(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (err) { return send(400,{error:route.invalid || err.message}); }
      const result = await route.run(data, aborted.signal);
      if (res.writableEnded || res.destroyed) return;
      if (route.binary) { res.writeHead(200,{'Content-Type':route.binary}); res.end(result); } else send(200,result);
    } catch (err) { if (!res.writableEnded) send(err.status || 502,{error:err.message}); } finally { if (route.lock) busy = false; }
    return;
  }
  if (req.method !== 'GET' || !files[req.url]) return send(404,{error:'Não encontrado.'});
  const [name,type] = files[req.url];
  try { const body = await readFile(new URL(`./public/${name}`,import.meta.url)); res.writeHead(200,{'Content-Type':type}); res.end(body); } catch { send(500,{error:'Não foi possível abrir a aplicação.'}); }
 });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const port = Number(process.env.PORT || 3210);
 const live = new LiveTutor();
 const server = createApp({ live });
 // Não deixa um Claude da cena órfão ao fechar o servidor.
 for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { live.close(); process.exit(); });
 process.on('exit', () => live.close());
 server.on('error', err => { console.error(`Não foi possível iniciar: ${err.message}`); process.exitCode=1; });
 server.listen(port,'127.0.0.1',() => console.log(`Lingua CLI → http://127.0.0.1:${port}`));
}
