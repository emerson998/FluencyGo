// Lê JSON de modelos: aceita cercas ```json e texto em volta do primeiro objeto {…} balanceado.
export function parseJsonLoose(raw) {
 const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
 try { return JSON.parse(text); } catch {}
 const start = text.indexOf('{');
 if (start >= 0) {
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
   const c = text[i];
   if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; }
   else if (c === '"') inString = true;
   else if (c === '{') depth++;
   else if (c === '}' && --depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { break; } }
  }
 }
 throw new Error('formato inesperado');
}
