const { chromium }=require(process.env.NARV_PLAYWRIGHT||'C:/Users/007/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-proxy-server'],executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://localhost:4173/');await p.locator('.featured h2').waitFor();console.log('Native WebMCP available:',await p.evaluate(()=>!!document.modelContext?.registerTool));
 await p.locator('[data-action=switch-role]').click();await p.locator('[data-account="demo-editor"]').click();await p.goto('http://localhost:4173/#/workspace/members');
 const f=p.locator('.identity-lookup-form[data-id="demo-author"]');await f.locator('..').locator('summary').click();await f.locator('[name=reason]').fill('核查稿件利益冲突所需的身份关联信息。');await f.getByRole('button',{name:'查询并记录'}).click();await p.locator('#identity-audit-log summary').filter({hasText:'1'}).waitFor();
 const q=await b.newPage();await q.addInitScript(()=>{window.testTools=[];Object.defineProperty(document,'modelContext',{value:{registerTool:tool=>window.testTools.push(tool)}})});await q.goto('http://localhost:4173/');await q.locator('.featured').waitFor();
 const result=await q.evaluate(()=>{const t=window.testTools[0],before=localStorage.getItem('narv-local-v2');const rows=t.execute({query:'交叉验证'});let rejected=false;try{t.execute({query:4})}catch{rejected=true}return {name:t.name,rows,readOnly:t.annotations.readOnlyHint,rejected,unchanged:before===localStorage.getItem('narv-local-v2')}});
 assert.equal(result.name,'search_narv_public_content');assert(result.rows.length);assert(result.readOnly&&result.rejected&&result.unchanged);assert.deepEqual(errors,[]);await b.close();console.log('PASS: identity audit counter, optional search API contract in mocked context, read-only state, valid/invalid input.');
})().catch(e=>{console.error(e);process.exit(1)});