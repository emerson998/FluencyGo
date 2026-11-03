import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, percentile } from '../src/scene/engine.js';
import { match, normalize, similarity } from '../src/scene/matcher.js';
import { createLevelGate } from '../src/scene/bargeIn.js';
import { createTurnDetector } from '../src/scene/turnDetector.js';
import { clone } from './fixtures/scene-map.mjs';
const types = actions => actions.map(a => a.type);
const play = actions => actions.find(a => a.type === 'play');
function setup(opts = {}) {
 let t = 0;
 const engine = createEngine({ map: clone(), now: () => t, ...opts });
 const clock = ms => { t += ms; };
 // Fala do professor até o fim e abre a escuta.
 const finishSpeech = () => engine.dispatch({ type: 'ttsEnded', turnId: engine.state.turnId });
 return { engine, clock, finishSpeech };
}
test('matcher normalizes contractions and accents and classifies speech', () => {
 assert.equal(normalize("I'd like a CAFÉ!", 'en'), 'i would like a cafe');
 assert.equal(similarity('a b c', 'a b c'), 1);
 const map = clone(), node = map.nodes[0];
 assert.equal(match("I'd like a large coffee, please.", node, map).kind, 'expected');
 assert.equal(match('I want a coffee big', node, map).kind, 'error');
 assert.equal(match('Sorry, can you repeat?', node, map).kind, 'help');
 assert.equal(match('Can you speak more slowly?', node, map).slow, true);
 assert.equal(match('banana', node, map).kind, 'unclear');
 assert.equal(match('Do you have wifi in this place?', node, map).kind, 'none');
});
test('expected answer advances on the map without calling Claude', () => {
 const { engine, finishSpeech } = setup();
 assert.deepEqual(play(engine.dispatch({ type: 'start' })).items, [{ voice: 'en', text: 'Hi! What would you like to drink?' }]);
 assert.ok(types(finishSpeech()).includes('listen'));
 const actions = engine.dispatch({ type: 'speechFinal', text: 'a large coffee please' });
 assert.ok(!types(actions).includes('callLive'));
 assert.equal(engine.state.nodeId, 'n2');
 assert.equal(play(actions).items[0].text, 'Milk or sugar?');
});
test('a predicted error gets recast plus Portuguese explanation only when trained', () => {
 const { engine, finishSpeech } = setup();
 engine.dispatch({ type: 'start' }); finishSpeech();
 const items = play(engine.dispatch({ type: 'speechFinal', text: 'I want a coffee big' })).items;
 assert.deepEqual(items.map(i => i.voice), ['en', 'pt', 'en']);
 assert.equal(items[0].text, 'A large coffee, sure!');
 assert.equal(engine.summary().corrections, 1);
});
test('help phrase repeats the last line slowly and does not advance', () => {
 const { engine, finishSpeech } = setup();
 engine.dispatch({ type: 'start' }); finishSpeech();
 const items = play(engine.dispatch({ type: 'speechFinal', text: 'Sorry, can you repeat?' })).items;
 assert.equal(items[0].rate, .75);
 assert.equal(engine.state.nodeId, 'n1');
});
test('off-script speech plays a filler, calls Claude, then speaks correction, recast and reply in order', () => {
 const { engine, clock, finishSpeech } = setup();
 engine.dispatch({ type: 'start' }); finishSpeech();
 const actions = engine.dispatch({ type: 'speechFinal', text: 'Do you have wifi in this place?' });
 assert.equal(engine.state.phase, 'THINKING');
 assert.equal(play(actions).filler, true);
 const call = actions.find(a => a.type === 'callLive');
 assert.deepEqual([call.nodeId, call.transcript], ['n1', 'Do you have wifi in this place?']);
 assert.deepEqual(engine.dispatch({ type: 'turnReply', turnId: call.turnId - 1, reply: { say: 'old' } }), []);
 clock(2500);
 const reply = engine.dispatch({ type: 'turnReply', turnId: call.turnId, reply: { say: 'Yes, we do! What would you like?', correction_ptbr: 'Diga "Wi-Fi".', recast: 'Do you have Wi-Fi?', backTo: 'n1' } });
 assert.deepEqual(play(reply).items.map(i => i.voice), ['pt', 'en', 'en']);
 engine.dispatch({ type: 'audioStarted', turnId: engine.state.turnId, filler: false });
 assert.equal(engine.summary().liveMedianMs, 2500);
 assert.equal(engine.summary().offScript, 1);
});
test('timeout and three off-script turns in a row fall back to a recovery line', () => {
 const { engine, finishSpeech } = setup();
 engine.dispatch({ type: 'start' }); finishSpeech();
 const call = engine.dispatch({ type: 'speechFinal', text: 'what time does the museum open today' }).find(a => a.type === 'callLive');
 const recovery = play(engine.dispatch({ type: 'turnTimeout', turnId: call.turnId })).items;
 assert.equal(recovery[0].text, 'Sorry, let us get back to your order.');
 finishSpeech();
 for (let i = 0; i < 2; i++) { const c = engine.dispatch({ type: 'speechFinal', text: 'tell me about the weather tomorrow please' }).find(a => a.type === 'callLive'); engine.dispatch({ type: 'turnReply', turnId: c.turnId, reply: { say: 'Hmm, ok.' } }); finishSpeech(); }
 const third = engine.dispatch({ type: 'speechFinal', text: 'tell me about the weather tomorrow please' });
 assert.ok(!types(third).includes('callLive'));
 assert.equal(play(third).items[0].text, 'Sorry, let us get back to your order.');
});
test('silence ladder: repeat question, then Portuguese hint, then pause', () => {
 const { engine, finishSpeech } = setup();
 engine.dispatch({ type: 'start' });
 let timer = finishSpeech().find(a => a.type === 'timer');
 assert.equal(timer.ms, 8000);
 assert.equal(play(engine.dispatch({ type: 'silenceTimeout', id: timer.id })).items[0].voice, 'en');
 timer = finishSpeech().find(a => a.type === 'timer');
 assert.deepEqual(play(engine.dispatch({ type: 'silenceTimeout', id: timer.id })).items[0], { voice: 'pt', text: 'dica de n1' });
 timer = finishSpeech().find(a => a.type === 'timer');
 engine.dispatch({ type: 'silenceTimeout', id: timer.id });
 assert.equal(engine.state.phase, 'PAUSED');
 assert.equal(play(engine.dispatch({ type: 'resume' })).items[0].text, 'Hi! What would you like to drink?');
});
test('barge-in stops the tutor only with headset; speech outside LISTENING is discarded', () => {
 const withHeadset = setup({ headset: true });
 withHeadset.engine.dispatch({ type: 'start' });
 assert.deepEqual(types(withHeadset.engine.dispatch({ type: 'bargeIn' })).slice(0, 2), ['stop', 'listen']);
 assert.equal(withHeadset.engine.summary().bargeIns, 1);
 const speaker = setup();
 assert.ok(types(speaker.engine.dispatch({ type: 'start' })).includes('unlisten'));
 assert.deepEqual(speaker.engine.dispatch({ type: 'bargeIn' }), []);
 assert.deepEqual(speaker.engine.dispatch({ type: 'speechFinal', text: 'Hi! What would you like to drink?' }), []);
});
test('reaching the last node ends the scene with a summary; G1 needs 5 minutes, 10 turns and no clicks', () => {
 const { engine, clock, finishSpeech } = setup({ stage: 3 });
 engine.dispatch({ type: 'start' });
 const answers = ['a large coffee please', 'Milk, please', 'No, thank you', 'For here, please', 'Here you are', 'Thank you, bye'];
 let done;
 for (const text of answers) { finishSpeech(); clock(60000); const acts = engine.dispatch({ type: 'speechFinal', text }); engine.dispatch({ type: 'audioStarted', turnId: engine.state.turnId, filler: false }); done = acts.find(a => a.type === 'done'); }
 assert.ok(done);
 assert.equal(engine.state.phase, 'DONE');
 assert.equal(done.summary.turns, 6);
 assert.equal(done.summary.passed, false);
 assert.equal(done.summary.durationMs, 360000);
});
test('percentile and level gate helpers', () => {
 assert.equal(percentile([1, 2, 3, 4], .5), 2);
 assert.equal(percentile([1, 2, 3, 4, 100], .95), 100);
 assert.equal(percentile([], .5), null);
 const gate = createLevelGate({ floorDb: -60, marginDb: 12, holdMs: 60, stepMs: 20 });
 assert.deepEqual([-40, -40, -55, -40, -40, -40].map(db => gate.feed(db)), [false, false, false, false, false, true]);
});
test('turn detector joins results after the configured pause and restarts when the browser stops', () => {
 const timers = []; let now = 0;
 const fakeTimers = { setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: id => { if (timers[id - 1]) timers[id - 1].f = null; } };
 const instances = [];
 class Rec { constructor() { instances.push(this); } start() {} abort() {} }
 const finals = [];
 const d = createTurnDetector({ Recognition: Rec, lang: 'es-MX', pauseMs: 1200, onFinal: t => finals.push(t), timers: fakeTimers, now: () => now });
 d.start();
 const r = instances[0];
 assert.deepEqual([r.lang, r.continuous, r.interimResults], ['es-MX', true, true]);
 const result = (text, isFinal) => Object.assign([{ transcript: text }], { isFinal });
 r.onresult({ resultIndex: 0, results: [result('quisiera', true)] });
 r.onresult({ resultIndex: 1, results: [result('quisiera', true), result('un café', false)] });
 assert.equal(timers.at(-1).ms, 1200);
 timers.at(-1).f();
 assert.deepEqual(finals, ['quisiera un café']);
 r.onend();
 assert.equal(instances.length, 2);
 for (let i = 0; i < 5; i++) instances.at(-1).onend?.();
 assert.equal(d.active, false);
});
