import { createHash } from 'node:crypto';
// Voz do modo Cena: servidor HTTP do Piper instalado pelo usuário (GPL, fora do repositório).
// Um servidor atende as três vozes (POST /synthesize com o nome da voz); PIPER_URL_<VOZ> separa uma voz em outro servidor.
export const voices = ['en', 'es', 'pt'];
export const defaultVoices = { en: 'en_US-lessac-medium', es: 'es_MX-claude-high', pt: 'pt_BR-faber-medium' };
export function piperUrl(voice, env = process.env) {
 const raw = env[`PIPER_URL_${voice.toUpperCase()}`] || env.PIPER_URL;
 if (!raw) return null;
 // Só localhost: o áudio não sai da máquina.
 try {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) return null;
  if (!url.pathname.endsWith('/synthesize')) url.pathname = `${url.pathname.replace(/\/$/, '')}/synthesize`;
  return url;
 } catch { return null; }
}
export function piperVoice(voice, env = process.env) {
 const name = env[`PIPER_VOICE_${voice.toUpperCase()}`];
 return /^[A-Za-z0-9_.-]{1,80}$/.test(name || '') ? name : defaultVoices[voice];
}
export function ttsConfigured(env = process.env) { return Object.fromEntries(voices.map(v => [v, Boolean(piperUrl(v, env))])); }
export function validateTts(data) {
 if (!data || !voices.includes(data.voice) || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 400) throw new Error('Dados de voz inválidos.');
 return data;
}
const failure = (status, message) => Object.assign(new Error(message), { status });
export function createSynth({ env = process.env, fetcher = fetch, max = 300 } = {}) {
 const cache = new Map();
 return async function synthesize({ text, voice }, { signal } = {}) {
  validateTts({ text, voice });
  const url = piperUrl(voice, env);
  if (!url) throw failure(503, 'Voz não configurada. Defina PIPER_URL no .env (veja o README).');
  const name = piperVoice(voice, env);
  const key = createHash('sha256').update(`${name}\0${text}`).digest('hex');
  if (cache.has(key)) { const hit = cache.get(key); cache.delete(key); cache.set(key, hit); return hit; }
  let response;
  try { response = await fetcher(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: name }), signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]) }); }
  catch { throw failure(502, 'Piper indisponível. Confira se o servidor de voz está rodando.'); }
  if (!response.ok) throw failure(502, `Piper retornou erro ${response.status}.`);
  const wav = Buffer.from(await response.arrayBuffer());
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw failure(502, 'Piper devolveu um áudio inválido.');
  cache.set(key, wav);
  if (cache.size > max) cache.delete(cache.keys().next().value);
  return wav;
 };
}
