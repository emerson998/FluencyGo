import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { evaluateSpeech, speechConfigured, validateSpeech } from './speech.js';
import { teach, runProcess, providers, validate } from './provider.js';
const files = {'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
export function createApp({ teacher = teach, runner = runProcess, evaluator = evaluateSpeech } = {}) {
 let busy = false;
 return createServer(async (req,res) => {
  const send = (status,value) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const address = req.headers.host;
  if (address !== `127.0.0.1:${res.socket.localPort}` && address !== `localhost:${res.socket.localPort}`) return send(403,{error:'Host não permitido.'});
  if (req.headers.origin && ![`http://127.0.0.1:${res.socket.localPort}`,`http://localhost:${res.socket.localPort}`].includes(req.headers.origin)) return send(403,{error:'Origem não permitida.'});
  if (req.method === 'GET' && req.url === '/api/status') {
    const status = await Promise.all(providers.map(async name => { try { const version = await runner(name,['--version'],'',{timeout:5000}); return {name,installed:true,version:version.slice(0,100)}; } catch { return {name,installed:false}; } }));
    return send(200,{providers:status,acoustic:speechConfigured(),note:'Instalação detectada; autenticação é confirmada na primeira conversa.'});
  }
  if (req.method === 'POST' && ['/api/chat','/api/speech'].includes(req.url)) {
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415,{error:'Envie JSON.'});
    if (busy) return send(429,{error:'Aguarde a resposta atual antes de enviar outra mensagem.'});
    let body = '', size = 0;
    try {
      for await (const chunk of req) { size += chunk.length; if (size > (req.url === '/api/speech' ? 1400000 : 64000)) { send(413,{error:'Mensagem muito grande.'}); return; } body += chunk; }
      let data; try { data = (req.url === '/api/speech' ? validateSpeech : validate)(JSON.parse(body)); } catch { return send(400,{error:'Dados inválidos. Confira idioma, nível e histórico.'}); }
      busy = true;
      try { send(200,await (req.url === '/api/speech' ? evaluator : teacher)(data)); } finally { busy = false; }
    } catch (err) { if (!res.writableEnded) send(502,{error:err.message}); }
    return;
  }
  if (req.method !== 'GET' || !files[req.url]) return send(404,{error:'Não encontrado.'});
  const [name,type] = files[req.url];
  try { const body = await readFile(new URL(`./public/${name}`,import.meta.url)); res.writeHead(200,{'Content-Type':type}); res.end(body); } catch { send(500,{error:'Não foi possível abrir a aplicação.'}); }
 });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const port = Number(process.env.PORT || 3210);
 const server = createApp();
 server.on('error', err => { console.error(`Não foi possível iniciar: ${err.message}`); process.exitCode=1; });
 server.listen(port,'127.0.0.1',() => console.log(`Lingua CLI → http://127.0.0.1:${port}`));
}
