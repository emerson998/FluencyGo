// Mapa de cena válido (SceneMap v1) usado pelos testes de servidor, engine e interface.
const line = (id, tutor, expected, next, extra = {}) => ({ id, tutor, tutor_ptbr: `tradução de ${id}`, hint_ptbr: `dica de ${id}`, expected: [{ text: expected, variants: [] }], likelyErrors: [], next, ...extra });
export const sceneMap = {
 schemaVersion: 1, language: 'en', level: 'A1', place: 'cafe', title: 'Pedindo um café',
 helpPhrases: [{ text: 'Sorry, can you repeat?', translation_ptbr: 'Desculpe, pode repetir?' }, { text: 'Can you speak more slowly?', translation_ptbr: 'Pode falar mais devagar?' }],
 recovery: ['Sorry, let us get back to your order.'], fillers: ['Hmm…'],
 nodes: [
  line('n1', 'Hi! What would you like to drink?', 'I would like a large coffee, please', 'n2', { expected: [{ text: 'I would like a large coffee, please', variants: ['a large coffee please'] }], likelyErrors: [{ pattern: 'I want a coffee big', recast: 'A large coffee, sure!', explain_ptbr: 'Em inglês o adjetivo vem antes: large coffee.', trained: true }] }),
  line('n2', 'Milk or sugar?', 'Milk, please', 'n3'),
  line('n3', 'Anything to eat?', 'No, thank you', 'n4'),
  line('n4', 'For here or to go?', 'For here, please', 'n5'),
  line('n5', 'That is four dollars.', 'Here you are', 'n6'),
  line('n6', 'Have a nice day!', 'Thank you, bye', null),
 ],
};
export const clone = () => structuredClone(sceneMap);
