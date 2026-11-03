import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LiveTutor, liveCommand, validateTurnReply, validateTurnRequest } from '../live.js';
import { clone } from './fixtures/scene-map.mjs';
const fake = fileURLToPath(new URL('./fixtures/fake-claude-stream.mjs', import.meta.url));
function tutor(mode = 'ok', delay = 0, opts = {}) {
 process.env.FAKE_MODE = mode; process.env.FAKE_DELAY = String(delay);
 return new LiveTutor({ command: () => [process.execPath, [fake]], env: {}, ...opts });
}
test('live command keeps CLI isolation flags and stream-json', () => {
 const [binary, args] = liveCommand('haiku');
 assert.equal(binary, 'claude');
 for (const flag of ['--input-format', 'stream-json', '--tools', '--no-session-persistence', 'mcp__*']) assert.ok(args.includes(flag), flag);
 assert.deepEqual(args.slice(-2), ['--model', 'haiku']);
});
test('turn request and reply validation', () => {
 assert.throws(() => validateTurnRequest({ sceneId: 'a', transcript: 'x'.repeat(501), nodeId: 'n1' }));
 assert.throws(() => validateTurnRequest({ sceneId: 'a', transcript: 'hi', nodeId: '../n1' }));
 assert.deepEqual(validateTurnReply({ say: 'Hi' }, clone()), { say: 'Hi', correction_ptbr: '', recast: '', backTo: null });
 assert.throws(() => validateTurnReply({ say: 'Hi', backTo: 'zz' }, clone()));
 assert.throws(() => validateTurnReply({ say: '' }, clone()));
});
test('one live process answers turns in order and keeps the scene', async () => {
 const live = tutor('ok', 5);
 try {
  const { sceneId } = await live.open({ map: clone() });
  assert.equal(live.status().open, true);
  const [a, b] = await Promise.all([live.turn({ sceneId, transcript: 'first', nodeId: 'n1' }), live.turn({ sceneId, transcript: 'second', nodeId: 'n1' })]);
  assert.equal(a.say, 'echo 1: first');
  assert.equal(a.correction_ptbr, 'Use "I would like".');
  assert.equal(b.say, 'echo 2: second');
  assert.equal(b.backTo, 'n2');
  await assert.rejects(live.turn({ sceneId: 'other', transcript: 'x', nodeId: 'n1' }), e => e.status === 409);
  assert.equal(typeof live.status().lastTurnMs, 'number');
 } finally { live.close(); }
});
test('bad JSON and invalid backTo become {timeout:true} and keep the same process', async () => {
 for (const mode of ['badjson', 'backto-invalid']) {
  const live = tutor(mode, 0, { turnTimeout: 2000 });
  try {
   const { sceneId } = await live.open({ map: clone() });
   const child = live.session.child;
   assert.deepEqual(await live.turn({ sceneId, transcript: 'hello', nodeId: 'n1' }), { timeout: true }, mode);
   assert.equal(live.session.child, child);
   assert.equal(live.status().open, true);
  } finally { live.close(); }
 }
});
test('a turn without answer kills the process, so a late answer never lands on the next turn', async () => {
 const live = tutor('silent', 0, { turnTimeout: 150 });
 try {
  const { sceneId } = await live.open({ map: clone() });
  const first = live.session.child;
  assert.deepEqual(await live.turn({ sceneId, transcript: 'hello', nodeId: 'n1' }), { timeout: true });
  assert.equal(live.status().open, false);
  process.env.FAKE_MODE = 'ok';
  const reply = await live.turn({ sceneId, transcript: 'second try', nodeId: 'n1' });
  assert.match(reply.say, /second try/);
  assert.notEqual(live.session.child, first);
 } finally { live.close(); }
});
test('idle stops only the process; the scene survives and reopens on the next turn', async () => {
 const live = tutor('ok', 0, { idleMs: 100 });
 try {
  const { sceneId } = await live.open({ map: clone() });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(live.status().open, false);
  assert.match((await live.turn({ sceneId, transcript: 'after idle', nodeId: 'n1' })).say, /after idle/);
 } finally { live.close(); }
});
test('close with another sceneId does not end the current scene', async () => {
 const live = tutor();
 try {
  const { sceneId } = await live.open({ map: clone() });
  assert.equal(live.close('old-scene'), false);
  assert.equal(live.status().open, true);
  assert.equal(live.close(sceneId), true);
  await assert.rejects(live.turn({ sceneId, transcript: 'x', nodeId: 'n1' }), e => e.status === 409);
 } finally { live.close(); }
});
test('a dead process is reopened on the next turn; close kills it and removes the folder', async () => {
 const live = tutor('exit-after-ready');
 const { sceneId } = await live.open({ map: clone() });
 const first = live.session.child;
 await new Promise(r => first.once('close', r));
 process.env.FAKE_MODE = 'ok';
 assert.match((await live.turn({ sceneId, transcript: 'again', nodeId: 'n1' })).say, /again/);
 assert.notEqual(live.session.child, first);
 const { child, cwd } = live.session;
 live.close();
 await new Promise(r => child.exitCode !== null || child.signalCode ? r() : child.once('close', r));
 for (let i = 0; i < 30 && existsSync(cwd); i++) await new Promise(r => setTimeout(r, 100));
 assert.equal(existsSync(cwd), false);
 assert.equal(live.status().open, false);
});
test('opening fails clearly when the CLI never answers', async () => {
 const live = tutor('silent', 1000, { openTimeout: 100 });
 await assert.rejects(live.open({ map: clone() }), /não respondeu/);
 assert.equal(live.status().open, false);
});
