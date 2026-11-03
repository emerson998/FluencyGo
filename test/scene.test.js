import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonLoose } from '../json.js';
import { buildScene, scenePrompt, sceneModel, validateSceneMap, validateSceneRequest } from '../scene.js';
import { clone, sceneMap } from './fixtures/scene-map.mjs';
const request = { language: 'en', level: 'A1', place: 'cafe' };
test('parseJsonLoose reads fences and surrounding text, rejects broken JSON', () => {
 assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
 assert.deepEqual(parseJsonLoose('Claro! {"a":"x } y","b":{"c":2}} pronto'), { a: 'x } y', b: { c: 2 } });
 assert.throws(() => parseJsonLoose('not json'), /formato inesperado/);
 assert.throws(() => parseJsonLoose('{"a":'), /formato inesperado/);
});
test('scene request only accepts known language, level and place', () => {
 assert.equal(validateSceneRequest(request).place, 'cafe');
 for (const bad of [{ ...request, place: 'moon' }, { ...request, level: 'C2' }, { ...request, language: 'fr' }, null]) assert.throws(() => validateSceneRequest(bad));
 assert.match(scenePrompt({ ...request, language: 'es' }), /América Latina/);
 assert.equal(sceneModel({}), 'haiku');
 assert.equal(sceneModel({ CLAUDE_SCENE_MODEL: 'sonnet' }), 'sonnet');
 assert.equal(sceneModel({ CLAUDE_SCENE_MODEL: 'x; rm -rf /' }), 'haiku');
});
test('scene map validation enforces schema, references and an ending', () => {
 assert.equal(validateSceneMap(clone(), request).title, sceneMap.title);
 const broken = [
  m => { m.nodes[1].next = 'nope'; },
  m => { m.nodes[2].id = 'n1'; },
  m => { m.nodes[0].tutor = 'x'.repeat(301); },
  m => { m.nodes.at(-1).next = 'n1'; },
  m => { m.nodes = m.nodes.slice(0, 3); m.nodes[2].next = null; },
  m => { m.place = 'moon'; },
  m => { m.schemaVersion = 2; },
  m => { m.nodes[0].likelyErrors[0].trained = 'yes'; },
  m => { m.helpPhrases = []; },
 ];
 for (const change of broken) { const m = clone(); change(m); assert.throws(() => validateSceneMap(m, request), /Cena gerada inválida/); }
 assert.throws(() => validateSceneMap(clone(), { ...request, language: 'es' }), /idioma/);
});
test('buildScene calls claude once with model flag, stdin prompt and temporary folder', async () => {
 let captured;
 const map = await buildScene(request, async (...args) => { captured = args; return `Aqui está:\n${JSON.stringify(sceneMap)}`; }, { CLAUDE_SCENE_MODEL: 'haiku' });
 assert.equal(map.nodes.length, 6);
 assert.equal(captured[0], 'claude');
 assert.deepEqual(captured[1].slice(-2), ['--model', 'haiku']);
 assert.ok(captured[1].includes('--no-session-persistence'));
 assert.match(captured[2], /café/);
 assert.ok(captured[3].cwd.includes('lingua-scene-'));
 assert.equal(captured[3].timeout, 90000);
 await assert.rejects(buildScene(request, async () => 'sem json'), /formato inesperado/);
});
