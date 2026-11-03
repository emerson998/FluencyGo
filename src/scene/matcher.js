// Compara a fala reconhecida com o nó atual do mapa, sem chamar o Claude.
const CONTRACTIONS={en:[[/\bi'd\b/g,'i would'],[/\bi'm\b/g,'i am'],[/\bi'll\b/g,'i will'],[/\bi've\b/g,'i have'],[/\byou're\b/g,'you are'],[/\bwhat's\b/g,'what is'],[/\bit's\b/g,'it is'],[/\bthat's\b/g,'that is'],[/\bthere's\b/g,'there is'],[/\bcan't\b/g,'cannot'],[/\bdon't\b/g,'do not'],[/\bdoesn't\b/g,'does not'],[/\bisn't\b/g,'is not'],[/\bwe're\b/g,'we are'],[/\blet's\b/g,'let us']],es:[[/\bdel\b/g,'de el'],[/\bal\b/g,'a el']]};
const HELP={en:['repeat','say that again','say it again','one more time','slowly','slower','sorry what','pardon','didn t understand','did not understand','don t understand','do not understand'],es:['repite','repetir','repetirlo','otra vez','despacio','mas lento','no entiendo','no entendi','perdon que','como dice']};
export function normalize(text,language='en'){let t=String(text??'').toLowerCase().replace(/[’`´]/g,"'");for(const [re,to] of CONTRACTIONS[language]||[])t=t.replace(re,to);return t.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function grams(t){const w=t.split(' ').filter(Boolean),g=[...w];for(let i=1;i<w.length;i++)g.push(`${w[i-1]} ${w[i]}`);return g;}
// Dice sobre palavras e pares de palavras: 1 = igual, 0 = nada em comum.
export function similarity(a,b){const x=grams(a),y=grams(b);if(!x.length||!y.length)return 0;const pool=[...y];let hit=0;for(const g of x){const i=pool.indexOf(g);if(i>=0){hit++;pool.splice(i,1);}}return 2*hit/(x.length+y.length);}
export const ACCEPT=.8,ERROR=.6,UNCLEAR=.3;
export function match(text,node,map){
 const lang=map.language,said=normalize(text,lang);if(!said)return {kind:'unclear',score:0};
 const best=(items,get)=>items.reduce((top,item)=>{const score=Math.max(...get(item).map(s=>similarity(said,normalize(s,lang))));return score>top.score?{item,score}:top;},{item:null,score:0});
 const help=best(map.helpPhrases,h=>[h.text]);
 if(help.score>=ERROR||HELP[lang].some(k=>` ${said} `.includes(` ${k} `)))return {kind:'help',item:help.item,score:help.score,slow:/slow|despacio|lento/.test(said)};
 const expected=best(node.expected,e=>[e.text,...(e.variants||[])]);
 if(expected.score>=ACCEPT)return {kind:'expected',item:expected.item,score:expected.score};
 const error=best(node.likelyErrors||[],e=>[e.pattern]);
 if(error.score>=ERROR&&error.score>=expected.score)return {kind:'error',item:error.item,score:error.score};
 if(Math.max(expected.score,error.score)<UNCLEAR&&said.split(' ').length<3)return {kind:'unclear',score:Math.max(expected.score,error.score)};
 return {kind:'none',score:Math.max(expected.score,error.score)};
}
