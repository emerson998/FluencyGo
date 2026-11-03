// Claude CLI falso em modo stream-json: lê uma mensagem por linha e responde com eventos system/assistant/result.
// FAKE_DELAY (ms), FAKE_MODE=ok|silent|badjson|exit-after-ready|backto-invalid.
import { createInterface } from 'node:readline';
const delay = Number(process.env.FAKE_DELAY || 0), mode = process.env.FAKE_MODE || 'ok';
let count = 0;
const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
createInterface({ input: process.stdin }).on('line', line => {
 const message = JSON.parse(line), n = count++;
 setTimeout(() => {
  emit({ type: 'system', subtype: 'init' });
  if (n === 0) { emit({ type: 'result', is_error: false, result: '{"ready":true}' }); if (mode === 'exit-after-ready') setTimeout(() => process.exit(0), 10); return; }
  if (mode === 'silent') return;
  const said = JSON.parse(message.message.content).fala_do_aluno;
  const reply = mode === 'badjson' ? 'not json' : JSON.stringify({ say: `echo ${n}: ${said}`, correction_ptbr: n === 1 ? 'Use "I would like".' : '', recast: '', backTo: mode === 'backto-invalid' ? 'zz' : 'n2' });
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: reply }] } });
  emit({ type: 'result', is_error: false, result: reply });
 }, delay);
});
