const normalize=s=>String(s||"").normalize("NFKC").toLocaleLowerCase().replace(/\s+/g," ").trim();
export function plainText(s){return String(s||"").replace(/!\[([^\]]*)\]\([^)]*\)/g," $1 ").replace(/<[^>]+>/g," ").replace(/[#$*>`_]/g," ").replace(/\s+/g," ").trim()}
function grams(s){const set=new Set();for(let i=0;i<s.length-1;i++)set.add(s.slice(i,i+2));return set}
function editDistance(a,b){if(Math.abs(a.length-b.length)>2)return 99;let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next}return row[b.length]}
function fuzzyMatch(text,term){if(term.length<3)return null;const candidates=/[\p{Script=Han}]/u.test(term)?Array.from({length:Math.max(0,text.length-term.length+2)},(_,i)=>text.slice(i,i+term.length)):text.match(/[\p{L}\p{N}]+/gu)||[];for(const candidate of candidates){if(candidate.length<3)continue;const distance=editDistance(candidate,term);if(distance<=1&&distance>0)return candidate}
if(term.length>=4){const g=grams(term);for(const candidate of candidates){const cg=grams(candidate),shared=[...g].filter(x=>cg.has(x)).length;if(shared/Math.max(g.size,cg.size)>=.55)return candidate}}return null}
function tokens(query){return normalize(query).match(/"[^"]+"|[^\s]+/g)?.map(x=>x.replace(/^"|"$/g,"").slice(0,64)).slice(0,12)||[]}
function validDate(s){if(!s)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+"T00:00:00Z");return !isNaN(d)&&d.toISOString().slice(0,10)===s}
function snippet(text,terms,matched){const raw=plainText(text),n=normalize(raw);let index=terms.map(t=>n.indexOf(t)).filter(i=>i>=0).sort((a,b)=>a-b)[0];if(index===undefined&&matched)index=n.indexOf(matched);index=Math.max(0,(index||0)-35);return (index?"…":"")+raw.slice(index,index+170)+(raw.length>index+170?"…":"")}
export function searchArticles(articles,comments,options={}){
const {query="",from="",to="",category="",author="",scope="all",fuzzy=true,mode="all",sort="relevance"}=options;
if(!validDate(from)||!validDate(to)||from&&to&&from>to)throw Error("请选择有效的日期范围，开始日期不能晚于结束日期。");
const terms=tokens(query),results=[];
for(const a of articles){if(a.status==="retracted")continue;const day=(a.date||a.publishedAt||"").slice(0,10).replaceAll(".","-");if((from&&day<from)||(to&&day>to)||(category&&a.category!==category)||(author&&!normalize(a.author).includes(normalize(author))))continue;
const fields=[];
if(["all","title"].includes(scope))fields.push({type:"title",text:a.title,weight:9});
if(["all","body"].includes(scope))fields.push({type:"body",text:(a.summary||"")+" "+plainText(a.content),weight:3});
if(["all","comments"].includes(scope))for(const c of comments.filter(c=>c.articleId===a.id&&c.status==="published"))fields.push({type:"comment",text:plainText(c.content),weight:2,commentId:c.id,commentAuthor:c.author});
let score=0,matchedTerms=new Set(),best=null;const fieldScores={};
for(const field of fields){const n=normalize(field.text);let fieldScore=0,near=null;for(const term of terms){if(n.includes(term)){fieldScore+=field.weight*(1+Math.min(n.split(term).length-2,3)*.1);matchedTerms.add(term)}else if(fuzzy){const candidate=fuzzyMatch(n,term);if(candidate){fieldScore+=field.weight*.35;matchedTerms.add(term);near=candidate}}}if(fieldScore>0){fieldScores[field.type]=Math.max(fieldScores[field.type]||0,fieldScore);score=Object.values(fieldScores).reduce((a,b)=>a+b,0);if(!best||fieldScore>best.score)best={...field,score:fieldScore,near}}}
if(terms.length&&(mode==="all"?matchedTerms.size!==terms.length:!matchedTerms.size))continue;
if(!terms.length&&scope==="comments"&&!fields.some(f=>f.type==="comment"))continue;
const match=best||fields.find(f=>f.type!=="title")||fields[0]||{text:a.summary,type:"body"};
results.push({article:a,score,source:match.type,commentId:match.commentId,commentAuthor:match.commentAuthor,fuzzyMatch:match.near,excerpt:snippet(match.text,terms,match.near),terms})
}results.sort((a,b)=>sort==="oldest"?(a.article.date||"").localeCompare(b.article.date||""):sort==="newest"?(b.article.date||"").localeCompare(a.article.date||""):b.score-a.score||(b.article.date||"").localeCompare(a.article.date||""));return results}
