import {readFile} from "node:fs/promises";
import {makeNotification} from "../public/messages.js";
import test from "node:test";
import assert from "node:assert/strict";
import {sqlite} from "../scripts/sqlite-adapter.mjs";
import {load,loadKeys,save} from "../backend/repository.js";
import {command,detail,bootstrap,snapshot,submissionAccess} from "../backend/service.js";
import {initialUsers} from "../public/roles.js";
import {withIdentities} from "../public/identity.js";
import {reviewBlocks} from "../public/markdown.js";
import {validateReviewAnchor} from "../public/review-anchors.js";
const d={title:"私密稿件标题",category:"科研与实践",summary:"验证撤回与批注不会向未授权账号泄露。",content:"# 标题\n\n这是**第一处证据**，与第二处证据不同。\n换行后有表情🙂与 $x^2$ 公式。\n\n- 列表里的证据\n\n## 结论\n\n私密正文，只在授权期间展示。",consents:{original:true,privacy:true,policy:true,responsibility:true}};
async function fixture(){const DB=sqlite(),b=await load(DB),s=structuredClone(b.state);s.users=initialUsers.map(withIdentities);await save(DB,b,s);return {DB}}
const run=(e,u,name,args,extra={})=>command(e,u,{name,args,...extra});
async function assigned(e){const s=(await run(e,"demo-author","create",[d])).result;await run(e,"demo-author","action",[s.id,"submit",d]);await run(e,"demo-temp","action",[s.id,"claim"]);return s.id}
const anchor=()=>{const b=reviewBlocks(d.content).find(b=>b.text.includes("第一处证据")),start=b.text.indexOf("第一处证据");return {blockId:b.id,start,end:start+5,quote:"第一处证据"}};
const note={anchor:anchor(),note:"请补充这处证据的来源与适用范围。",expectedVersion:1,expectedRound:1};
test("无意见撤回只允许作者读取正文与版本；原审稿人、AE、Editor、OE 均被拒绝",async()=>{
 const e=await fixture();try{const id=await assigned(e);await run(e,"demo-author","action",[id,"withdraw"]);
 assert.equal((await detail(e,"demo-author",id)).submission.status,"withdrawn");assert.equal((await detail(e,"demo-author",id,1)).content,d.content);
 for(const u of ["demo-temp","demo-reviewer","demo-ae","demo-editor","demo-original"]){
  await assert.rejects(detail(e,u,id),error=>error.status===403);await assert.rejects(detail(e,u,id,1),error=>error.status===403);
  assert.deepEqual(await submissionAccess(e,u,id),{allowed:false});
  for(const tab of ["reviews","members","applications","messages"]){const b=await bootstrap(e,u,{tab,thin:false});assert(!JSON.stringify(b.submissions).includes(id));assert(!JSON.stringify(b).includes(d.content))}
 }
 const st=(await load(e.DB)).state;assert.equal(st.submissions[0].reviewerId,null);assert.equal(st.submissions[0].withdrawnReviewerId,"demo-temp");assert(!st.notifications.some(n=>n.userId!=="demo-author"&&n.link==="#/submission/"+id));
 // Legacy rows with an old assignment are denied by the same policy.
 const b=await loadKeys(e.DB,["submissions/"+id]),after=structuredClone(b.state);after.submissions[0].reviewerId="demo-temp";await save(e.DB,b,after);
 assert.equal((await bootstrap(e,"demo-temp",{tab:"reviews"})).submissions.length,0);await assert.rejects(detail(e,"demo-temp",id),error=>error.status===403);
 }finally{e.DB.close()}
});
test("删除后所有角色均不能读取正文、版本或恢复旧的认领关系",async()=>{
 const e=await fixture();try{const id=await assigned(e);await run(e,"demo-author","action",[id,"withdraw"]);await run(e,"demo-author","deleteDraft",[id]);
 for(const u of ["demo-author","demo-temp","demo-ae","demo-editor","demo-original"]){await assert.rejects(detail(e,u,id),error=>error.status===404);await assert.rejects(detail(e,u,id,1),error=>error.status===404);assert.deepEqual(await submissionAccess(e,u,id),{allowed:false});assert(!(await bootstrap(e,u,{tab:"reviews"})).submissions.some(s=>s.id===id))}
 await assert.rejects(run(e,"demo-temp","action",[id,"claim"]),/不存在/);
 }finally{e.DB.close()}
});
test("批注绑定段落与原文片段；重复文字、格式、换行和公式不使用屏幕行号",()=>{
 const blocks=reviewBlocks(d.content),b=blocks.find(b=>b.text.includes("第一处证据"));assert.equal(b.text,"这是第一处证据，与第二处证据不同。\n换行后有表情🙂与 x^2 公式。");
 const exact=validateReviewAnchor(d.content,anchor());assert.equal(exact.quote,"第一处证据");assert.equal(exact.prefix,"这是");
 assert.throws(()=>validateReviewAnchor(d.content,{...anchor(),quote:"伪造的文字"}),/不符/);
 assert.throws(()=>validateReviewAnchor(d.content,{...anchor(),blockId:"b999-1000"}),/变化/);
 assert.throws(()=>validateReviewAnchor(d.content,{...anchor(),start:-1}),/1–1000/);
 const table=["| 证据 | 内容 |","| --- | --- |","| **甲** | 原始材料 |"].join(String.fromCharCode(10)),cell=reviewBlocks(table).find(b=>b.text==="原始材料");assert(cell);assert.equal(validateReviewAnchor(table,{blockId:cell.id,start:0,end:4,quote:"原始材料"}).quote,"原始材料");
 const emojiStart=b.text.indexOf("🙂");assert.throws(()=>validateReviewAnchor(d.content,{blockId:b.id,start:emojiStart,end:emojiStart+1,quote:b.text.slice(emojiStart,emojiStart+1)}),/Unicode/);
});
test("批注草稿持久化但仅当前审稿人可见；发送决定后作者看到绑定版本的批注",async()=>{
 const e=await fixture();try{const id=await assigned(e);await run(e,"demo-temp","action",[id,"annotation_save",note]);let own=(await detail(e,"demo-temp",id)).submission;assert.equal(own.reviewAnnotations.length,1);const a=own.reviewAnnotations[0];
 for(const u of ["demo-author","demo-ae","demo-editor","demo-original"]){const data=await detail(e,u,id);assert.equal(data.submission.reviewAnnotations.length,0);assert(!JSON.stringify(await bootstrap(e,u,{tab:"reviews",thin:false})).includes(note.note))}
 assert.equal(own.reviews.length,0);assert.equal((await bootstrap(e,"demo-temp",{tab:"scores"})).points,0);
 await assert.rejects(run(e,"demo-original","action",[id,"annotation_save",note]),/资格/);await assert.rejects(run(e,"demo-reviewer","action",[id,"annotation_save",note]),/当前审稿人/);
 await run(e,"demo-temp","action",[id,"annotation_save",{...note,id:a.id,note:"修改后的批注意见，要求进一步解释条件。"}]);
 await run(e,"demo-temp","action",[id,"review",{expectedVersion:1,decision:"revise",note:"请先补充批注中指出的证据与范围，再提交修订。",conflictFree:true}]);
 const author=(await detail(e,"demo-author",id)).submission;assert.equal(author.reviews[0].annotations[0].version,1);assert.equal(author.reviews[0].annotations[0].anchor.quote,"第一处证据");assert.equal(author.reviews[0].annotations[0].note,"修改后的批注意见，要求进一步解释条件。");assert.equal(author.reviewAnnotations.length,0);
 await run(e,"demo-author","action",[id,"submit",{...d,content:"# 新版\n\n新的证据和新的结构。".repeat(5)}]);assert.equal((await detail(e,"demo-author",id,1)).content,d.content);
 await assert.rejects(run(e,"demo-temp","action",[id,"annotation_save",note]),/版本|资格/);
 }finally{e.DB.close()}
});
test("未发送批注不锁定作者；撤回后草稿无法被原审稿人继续读取或修改",async()=>{
 const e=await fixture();try{const id=await assigned(e);await run(e,"demo-temp","action",[id,"annotation_save",note]);const a=(await detail(e,"demo-temp",id)).submission.reviewAnnotations[0];
 await run(e,"demo-temp","action",[id,"annotation_delete",{id:a.id,expectedVersion:1,expectedRound:1}]);assert.equal((await detail(e,"demo-temp",id)).submission.reviewAnnotations.length,0);
 await run(e,"demo-temp","action",[id,"annotation_save",note]);await run(e,"demo-author","action",[id,"withdraw"]);
 assert.equal((await detail(e,"demo-author",id)).submission.reviewAnnotations.length,0);await assert.rejects(run(e,"demo-temp","action",[id,"annotation_save",note]),/访问权限/);await assert.rejects(detail(e,"demo-temp",id),error=>error.status===403);
 await run(e,"demo-author","deleteDraft",[id]);assert.equal((await loadKeys(e.DB,["submissions/"+id])).state.submissions.length,0);
 }finally{e.DB.close()}
});

test("历史通知迁移删除失效链接，保留作者通知与仍可访问的稿件通知",async()=>{
 const e=await fixture();try{
 const hidden=await assigned(e);await run(e,"demo-author","action",[hidden,"withdraw"]);const active=await assigned(e);
 const b=await load(e.DB),a=structuredClone(b.state),revoked=makeNotification("demo-temp","旧通知","旧撤回标题","#/submission/"+hidden),owned=makeNotification("demo-author","自己的通知","作者仍有访问权限","#/submission/"+hidden),valid=makeNotification("demo-temp","有效通知","当前仍在审稿","#/submission/"+active),missing=makeNotification("demo-temp","已删除通知","无来源","#/submission/N-REMOVED");
 a.notifications.push(revoked,owned,valid,missing);await save(e.DB,b,a);
 const migration=await readFile(new URL("../backend/migrations/0005_withdrawal_visibility.sql",import.meta.url),"utf8");
 await e.DB.batch(migration.split(/;\s*(?:\n|$)/).filter(s=>s.trim()).map(sql=>e.DB.prepare(sql)));
 const st=(await load(e.DB)).state;assert(!st.notifications.some(n=>[revoked.id,missing.id].includes(n.id)));assert(st.notifications.some(n=>n.id===owned.id));assert(st.notifications.some(n=>n.id===valid.id));assert(st.submissions.some(s=>s.id===hidden&&s.content===d.content));
 for(const id of [revoked.id,missing.id])assert.equal((await e.DB.prepare("SELECT count(*) AS n FROM records WHERE key=?").bind("notifications/"+id).first()).n,0);
 }finally{e.DB.close()}
});
