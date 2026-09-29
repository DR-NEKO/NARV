import test from "node:test";
import assert from "node:assert/strict";
import {sqlite} from "../scripts/sqlite-adapter.mjs";
import {load,save,head} from "../backend/repository.js";
import {command,detail,bootstrap} from "../backend/service.js";
import {initialUsers} from "../public/roles.js";
import {withIdentities} from "../public/identity.js";
import {reviewBlocks,renderMarkdown,articleReadingSource} from "../public/markdown.js";
import {revisionDiff} from "../public/revision-diff.js";
import {reviewKey} from "../public/review-replies.js";
const draft={title:"对照文章",category:"科研与实践",summary:"测试返修的版本对照与逐条回复。",content:"# 对照文章\n\n作者：作者\n\n---\n\n## 依据\n\n这段包含**重要证据**，还有 $x^2$ 公式。\n\n### 细节\n\n这里说明讨论的范围与条件，让读者可以检查论证。",consents:{original:true,privacy:true,policy:true,responsibility:true}};
async function fixture(){const DB=sqlite(),before=await load(DB),s=structuredClone(before.state);s.users=initialUsers.map(withIdentities);await save(DB,before,s);return {DB}}
const run=(e,u,id,action,data={})=>command(e,u,{name:"action",args:[id,action,data]});
async function assigned(e){const s=(await command(e,"demo-author",{name:"create",args:[draft]})).result;await run(e,"demo-author",s.id,"submit",draft);await run(e,"demo-temp",s.id,"claim");return s.id}
test("审稿总意见与批注无字数下限，保留长度上限与资格校验",async()=>{
 const e=await fixture();try{const id=await assigned(e),b=reviewBlocks(draft.content)[0],anchor={blockId:b.id,start:0,end:2,quote:b.text.slice(0,2)};
 await run(e,"demo-temp",id,"annotation_save",{anchor,note:"改",expectedVersion:1,expectedRound:1});
 await run(e,"demo-temp",id,"annotation_save",{anchor,note:"",expectedVersion:1,expectedRound:1});
 await assert.rejects(run(e,"demo-temp",id,"review",{expectedVersion:1,note:"x".repeat(5001),decision:"revise",conflictFree:true}),/最多/);
 await run(e,"demo-temp",id,"review",{expectedVersion:1,note:"",decision:"revise",conflictFree:true});
 const s=(await detail(e,"demo-author",id)).submission;assert.equal(s.reviews[0].note,"");assert.equal(s.reviews[0].annotations.length,2);
 }finally{e.DB.close()}
});
test("逐条回复草稿只有作者可见；随修订提交冻结，重写不改变历史回复",async()=>{
 const e=await fixture();try{const id=await assigned(e),b=reviewBlocks(draft.content).find(b=>b.text.includes("重要证据")),anchor={blockId:b.id,start:0,end:2,quote:b.text.slice(0,2)};
 await run(e,"demo-temp",id,"annotation_save",{anchor,note:"改",expectedVersion:1,expectedRound:1});
 await run(e,"demo-temp",id,"review",{expectedVersion:1,note:"按照意见修改。",decision:"revise",conflictFree:true});
 let s=(await detail(e,"demo-author",id)).submission;const key=reviewKey(s.reviews[0]),item=s.reviews[0].annotations[0].id;
 for(const itemId of ["overall",item])await run(e,"demo-author",id,"reply_save",{reviewKey:key,itemId,text:"第一轮回复",expectedVersion:1});
 await assert.rejects(run(e,"demo-temp",id,"reply_save",{reviewKey:key,itemId:item,text:"假冒"}),/仅作者/);
 await assert.rejects(run(e,"demo-author",id,"reply_save",{reviewKey:key,itemId:"wrong",text:"错误"}),/不存在/);
 await assert.rejects(run(e,"demo-author",id,"reply_save",{reviewKey:"wrong",itemId:"overall",text:"错误"}),/不存在/);
 for(const u of ["demo-temp","demo-editor","demo-original"]){s=(await detail(e,u,id)).submission;assert(!JSON.stringify(s).includes("第一轮回复"));assert(!s.reviewReplyDrafts?.length)}
 const revision={...draft,content:draft.content.replace("重要证据","新增的可靠证据")};await run(e,"demo-author",id,"save",revision);
 assert.equal((await detail(e,"demo-author",id,1)).content,draft.content);
 await run(e,"demo-author",id,"submit",revision);
 s=(await detail(e,"demo-temp",id)).submission;assert.equal(s.reviewReplies.length,2);assert.equal(s.reviewReplies[0].submittedVersion,2);assert.equal(s.reviewReplyDrafts,undefined);
 assert.equal((await detail(e,"demo-temp",id,1)).content,draft.content);assert.equal((await detail(e,"demo-temp",id,2)).content,revision.content);
 await assert.rejects(run(e,"demo-author",id,"reply_save",{reviewKey:key,itemId:item,text:"锁定期间"}),/仅作者/);
 await run(e,"demo-temp",id,"review",{expectedVersion:2,decision:"revise",note:"继续",conflictFree:true});
 await run(e,"demo-author",id,"reply_save",{reviewKey:key,itemId:item,text:"第二轮回复"});
 await run(e,"demo-author",id,"submit",revision);
 s=(await detail(e,"demo-temp",id)).submission;assert.equal(s.reviewReplies.filter(x=>x.itemId===item).length,2);assert.equal(s.reviewReplies.find(x=>x.submittedVersion===2).text,"第一轮回复");assert.equal(s.reviewReplies.at(-1).submittedVersion,3);
 const h=head("submissions",s);assert.deepEqual(h.reviewReplies,[]);assert.deepEqual(h.reviewReplyDrafts,[]);
 assert(!JSON.stringify((await bootstrap(e,"demo-temp",{tab:"reviews"})).submissions).includes("第二轮回复"));
 await run(e,"demo-temp",id,"review",{expectedVersion:3,decision:"accept",conflictFree:true});await run(e,"demo-author",id,"publish",{publishConsent:true});
 const published=(await bootstrap(e,null)).articles.find(a=>a.id===id);assert(!JSON.stringify(published).includes("第一轮回复"));assert(!JSON.stringify(published).includes("reviewReplies"));
 }finally{e.DB.close()}
});
test("删除回复草稿与过期版本保护",async()=>{
 const e=await fixture();try{const id=await assigned(e);await run(e,"demo-temp",id,"review",{expectedVersion:1,decision:"revise",note:"改",conflictFree:true});const key=reviewKey((await detail(e,"demo-author",id)).submission.reviews[0]);
 await run(e,"demo-author",id,"reply_save",{reviewKey:key,itemId:"overall",text:"回复"});
 await run(e,"demo-author",id,"reply_save",{reviewKey:key,itemId:"overall",text:""});
 assert.equal((await detail(e,"demo-author",id)).submission.reviewReplyDrafts.length,0);
 await assert.rejects(run(e,"demo-author",id,"reply_save",{expectedVersion:0,reviewKey:key,itemId:"overall",text:"过期"}),/新版本/);
 }finally{e.DB.close()}
});
test("中文差异精确标记、转义HTML，渲染标记只在返修环境出现",()=>{
 const a="# 标题\n\n原来的证据🙂\n\n结束\n",b="# 标题\n\n新增的证据🙂<script>\n\n结束\n",diff=revisionDiff(a,b);
 assert(diff.changed);assert(diff.oldHtml.includes("diff-removed"));assert(diff.newHtml.includes("diff-added"));assert(!diff.newHtml.includes("<script>"));assert(diff.oldRanges.length&&diff.newRanges.length);
 const highlighted=renderMarkdown(b,{}, {diffRanges:diff.newRanges,diffClass:"diff-added-block",annotatable:true});
 assert(highlighted.includes("diff-added-block"));assert(highlighted.includes("data-review-block"));assert(!renderMarkdown(b).includes("diff-added-block"));
 assert.equal(revisionDiff(a,a).changed,false);
 const huge=revisionDiff("甲\n".repeat(6000),"乙\n".repeat(6000));assert(huge.coarse);assert(huge.newRanges.length);
});
test("发表页仅移除开头同名标题和重复作者，不改源稿、不删异名标题",()=>{
 const source="# 对照文章\n\n**作者：** 作者\n\n---\n\n## 依据\n\n正文。\n";
 const body=articleReadingSource(source,"对照文章","作者");assert(body.startsWith("## 依据"));assert.equal(source.includes("# 对照文章"),true);
 assert.equal(articleReadingSource(source,"别的标题","作者"),source);
 assert(articleReadingSource(source,"对照文章","别人").includes("作者："));
 assert(articleReadingSource("# 对照文章\n\n正文中提到作者：作者","对照文章","作者").includes("正文中提到"));
});
