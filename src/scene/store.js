// Cenas no navegador, separadas do histórico da conversa por texto (lingua-v1).
export const KEY='fluencygo-scenes-v1';
const empty=()=>({version:1,current:null,sessions:[]});
export function loadScenes(storage=globalThis.localStorage){try{const data=JSON.parse(storage.getItem(KEY)||'null');return data?.version===1?{...empty(),...data,sessions:Array.isArray(data.sessions)?data.sessions:[]}:empty();}catch{return empty();}}
function write(data,storage){try{storage.setItem(KEY,JSON.stringify(data));return true;}catch{return false;}}
export function saveCurrent(current,storage=globalThis.localStorage){const data=loadScenes(storage);return write({...data,current:current&&{...current,history:(current.history||[]).slice(-20)}},storage);}
export function addSession(session,storage=globalThis.localStorage){const data=loadScenes(storage);return write({...data,current:null,sessions:[...data.sessions,session].slice(-50)},storage);}
