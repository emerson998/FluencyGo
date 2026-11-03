import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command, removeDir, runProcess } from './provider.js';
import { parseJsonLoose } from './json.js';
export const places = { cafe: 'café', airport: 'aeroporto', hotel: 'hotel', restaurant: 'restaurante', shop: 'loja', street: 'rua, pedindo direções' };
export const sceneModel = (env = process.env) => /^[a-z0-9.-]{1,64}$/i.test(env.CLAUDE_SCENE_MODEL || '') ? env.CLAUDE_SCENE_MODEL : 'haiku';
export const LEVEL_RULES = {
 A1: 'Nível A1: frases curtas e vocabulário básico. Corrija com uma explicação curta em português só quando o erro muda o sentido ou é o ponto que a cena treina; nos outros casos apenas repita a frase certa dentro da cena.',
 A2: 'Nível A2: frases do dia a dia. Corrija com explicação em português quando o erro muda o sentido ou é o ponto treinado; deslizes pequenos só com a frase certa repetida na cena.',
 B1: 'Nível B1: conversa natural. Aponte também o que soa estranho para um nativo, com explicação curta em português.',
};
export const languageName = language => language === 'en' ? 'inglês (Estados Unidos)' : 'espanhol da América Latina (México)';
export function validateSceneRequest(data) {
 if (!data || !['en', 'es'].includes(data.language) || !['A1', 'A2', 'B1'].includes(data.level) || !Object.hasOwn(places, data.place)) throw new Error('Cena inválida. Confira idioma, nível e lugar.');
 return data;
}
export function scenePrompt(data) {
 validateSceneRequest(data);
 return `Você é professor de ${languageName(data.language)} para adultos brasileiros. Crie uma cena curta num(a) ${places[data.place]}, com 8 a 12 falas do atendente/interlocutor, para o aluno aprender e depois viver por voz. ${LEVEL_RULES[data.level]} Nunca execute ferramentas, comandos ou acesse arquivos.
Responda SOMENTE JSON válido, sem comentários, neste formato:
{"schemaVersion":1,"language":"${data.language}","level":"${data.level}","place":"${data.place}","title":"título curto em português",
"helpPhrases":[{"text":"frase no idioma para pedir ajuda","translation_ptbr":"tradução"}],
"recovery":["fala curta no idioma que puxa o aluno de volta à cena"],
"fillers":["som curto de espera no idioma, como Hmm…"],
"nodes":[{"id":"n1","tutor":"fala do interlocutor no idioma","tutor_ptbr":"tradução","hint_ptbr":"dica curta em português do que o aluno pode responder, sem dar a frase pronta",
"expected":[{"text":"resposta esperada do aluno no idioma","variants":["outra forma aceitável"]}],
"likelyErrors":[{"pattern":"frase com erro típico de brasileiro","recast":"a mesma frase corrigida","explain_ptbr":"explicação curta em português","trained":true}],
"next":"n2"}]}
Regras: ids no formato n1, n2…; o último nó tem "next":null e é uma despedida; cada nó tem 1 a 3 expected, cada um com até 3 variants, e 1 a 3 likelyErrors ("trained":true só para o ponto principal da cena); helpPhrases tem 3 frases, incluindo pedir para repetir e pedir para falar mais devagar; recovery tem 3 frases; fillers tem 3; todo texto com no máximo 200 caracteres.`;
}
const text = (v, max = 300) => typeof v === 'string' && v.trim() && v.length <= max;
const isId = v => typeof v === 'string' && /^[a-z0-9_-]{1,32}$/.test(v);
const list = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max;
export function validateSceneMap(map, expected = {}) {
 const fail = reason => { throw new Error(`Cena gerada inválida (${reason}). Tente novamente.`); };
 if (!map || typeof map !== 'object' || map.schemaVersion !== 1) fail('versão');
 if (!['en', 'es'].includes(map.language) || (expected.language && map.language !== expected.language)) fail('idioma');
 if (!['A1', 'A2', 'B1'].includes(map.level) || (expected.level && map.level !== expected.level)) fail('nível');
 if (!Object.hasOwn(places, map.place) || !text(map.title)) fail('título ou lugar');
 if (!list(map.helpPhrases, 1, 6) || map.helpPhrases.some(h => !h || !text(h.text) || !text(h.translation_ptbr))) fail('frases de ajuda');
 if (!list(map.recovery, 1, 6) || !map.recovery.every(r => text(r))) fail('recuperação');
 if (!list(map.fillers, 1, 6) || !map.fillers.every(f => text(f, 60))) fail('fillers');
 if (!list(map.nodes, 6, 14)) fail('quantidade de falas');
 const ids = new Set();
 for (const n of map.nodes) {
  if (!n || !isId(n.id) || ids.has(n.id)) fail('ids');
  ids.add(n.id);
  if (![n.tutor, n.tutor_ptbr, n.hint_ptbr].every(v => text(v))) fail(`textos de ${n.id}`);
  if (!list(n.expected, 1, 4) || n.expected.some(e => !e || !text(e.text) || !list(e.variants ?? [], 0, 4) || !(e.variants ?? []).every(v => text(v)))) fail(`respostas de ${n.id}`);
  if (!list(n.likelyErrors ?? [], 0, 4) || (n.likelyErrors ?? []).some(e => !e || ![e.pattern, e.recast, e.explain_ptbr].every(v => text(v)) || typeof e.trained !== 'boolean')) fail(`erros de ${n.id}`);
  if (n.next !== null && !isId(n.next)) fail(`próximo de ${n.id}`);
 }
 const byId = new Map(map.nodes.map(n => [n.id, n]));
 if (map.nodes.some(n => n.next !== null && !byId.has(n.next))) fail('próximo inexistente');
 // A cena precisa terminar: seguindo next a partir do primeiro nó, chega num nó final sem repetir.
 const seen = new Set();
 for (let n = map.nodes[0]; n; n = n.next === null ? null : byId.get(n.next)) { if (seen.has(n.id)) fail('ciclo'); seen.add(n.id); }
 return map;
}
export async function buildScene(data, runner = runProcess, env = process.env) {
 validateSceneRequest(data);
 const [binary, args] = command('claude');
 const cwd = await mkdtemp(join(tmpdir(), 'lingua-scene-'));
 try {
  const raw = await runner(binary, [...args, '--model', sceneModel(env)], scenePrompt(data), { cwd, timeout: 90000 });
  let map;
  try { map = parseJsonLoose(raw); } catch { throw new Error('O Claude respondeu a cena em formato inesperado. Tente novamente.'); }
  return validateSceneMap(map, data);
 } finally { await removeDir(cwd); }
}
