import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '../src/audio.js';
import { createSynth, piperUrl, piperVoice, ttsConfigured, validateTts } from '../tts.js';
const wav = Buffer.from(encodeWav(new Float32Array(160)));
const env = { PIPER_URL: 'http://127.0.0.1:5001', PIPER_URL_ES: 'http://example.com:5002', PIPER_VOICE_PT: 'pt_BR-edresson-low' };
test('only localhost Piper URLs are accepted and point to /synthesize', () => {
 assert.deepEqual(ttsConfigured(env), { en: true, es: false, pt: true });
 assert.equal(String(piperUrl('en', env)), 'http://127.0.0.1:5001/synthesize');
 assert.equal(String(piperUrl('en', { PIPER_URL_EN: 'http://localhost:5009/synthesize' })), 'http://localhost:5009/synthesize');
 assert.equal(piperUrl('es', { PIPER_URL_ES: 'https://127.0.0.1:5002' }), null);
 assert.equal(piperUrl('es', { PIPER_URL_ES: 'not a url' }), null);
 assert.equal(piperVoice('pt', env), 'pt_BR-edresson-low');
 assert.equal(piperVoice('es', { PIPER_VOICE_ES: '../../x' }), 'es_MX-claude-high');
 assert.throws(() => validateTts({ voice: 'en', text: 'x'.repeat(401) }));
 assert.throws(() => validateTts({ voice: 'fr', text: 'hi' }));
});
test('synthesize posts text and voice name to Piper, refuses redirects, checks WAV and caches', async () => {
 const calls = [];
 const synth = createSynth({ env, fetcher: async (url, opts) => { calls.push([String(url), JSON.parse(opts.body), opts.redirect]); return new Response(wav); } });
 assert.deepEqual(await synth({ voice: 'en', text: 'Hello' }), wav);
 await synth({ voice: 'en', text: 'Hello' });
 assert.equal(calls.length, 1);
 assert.deepEqual(calls[0], ['http://127.0.0.1:5001/synthesize', { text: 'Hello', voice: 'en_US-lessac-medium' }, 'error']);
 await synth({ voice: 'pt', text: 'Olá' });
 assert.equal(calls[1][1].voice, 'pt_BR-edresson-low');
 await assert.rejects(synth({ voice: 'es', text: 'Hola' }), e => e.status === 503);
 const bad = createSynth({ env, fetcher: async () => new Response('nope') });
 await assert.rejects(bad({ voice: 'en', text: 'x' }), /inválido/);
 const down = createSynth({ env, fetcher: async () => { throw new Error('ECONNREFUSED'); } });
 await assert.rejects(down({ voice: 'en', text: 'x' }), /Piper indisponível/);
});
test('cache drops the oldest entry past the limit', async () => {
 let n = 0;
 const synth = createSynth({ env, max: 2, fetcher: async () => { n++; return new Response(wav); } });
 for (const text of ['a', 'b', 'c', 'a']) await synth({ voice: 'en', text });
 assert.equal(n, 4);
});
