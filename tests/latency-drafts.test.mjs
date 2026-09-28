import test from "node:test";
import assert from "node:assert/strict";
import {sqlite} from "../scripts/sqlite-adapter.mjs";
import {load,save} from "../backend/repository.js";
import {command,bootstrap} from "../backend/service.js";
import {withIdentities} from "../public/identity.js";
import {initialUsers} from "../public/roles.js";
import {markdown} from "../public/ui.js";
const draft={title:"可删除的未提交草稿",category:"科研与实践",summary:"完整摘要，记录草稿删除以及权限校验。",content:"背景、材料和具体方法。".repeat(12),consents:{original:true,privacy:true,policy:true,responsibility:true}};
async function fixture(){const DB=sqlite(),b=await load(DB),s=structuredClone(b.state);s.users=initialUsers.map(withIdentities);await save(DB,b,s);return {DB}}
const run=(e,u,name,args)=>command(e,u,{name,args});
test("只允许作者删除从未提交过的草稿，删除同时清除实体和附件引用",async()=>{
 const e=await fixture();try{const d={...draft,content:draft.content+"\n![配图](narv-image:img-1)",images:{"img-1":"data:image/png;base64,aGVsbG8="}},a=await run(e,"demo-author","create",[d]);
 await assert.rejects(run(e,"demo-temp","deleteDraft",[a.result.id]),/仅作者/);await run(e,"demo-author","deleteDraft",[a.result.id]);
 assert.equal((await e.DB.prepare("SELECT count(*) AS n FROM entities WHERE key=?").bind("submissions/"+a.result.id).first()).n,0);
 assert.equal((await e.DB.prepare("SELECT count(*) AS n FROM records WHERE key=?").bind("submissions/"+a.result.id).first()).n,0);
 assert.equal((await e.DB.prepare("SELECT count(*) AS n FROM blob_links WHERE entity_key=?").bind("submissions/"+a.result.id).first()).n,0);
 const b=await run(e,"demo-author","create",[draft]);await run(e,"demo-author","action",[b.result.id,"submit",draft]);await run(e,"demo-author","action",[b.result.id,"withdraw",{}]);await assert.rejects(run(e,"demo-author","deleteDraft",[b.result.id]),/未提交/);
 }finally{e.DB.close()}
});
test("工作台按页读取且合并为三次数据库往返，双身份设置无需取其他业务",async()=>{
 const e=await fixture();try{let trips=0;const DB=e.DB,counted={...DB,prepare(sql){const q=DB.prepare(sql);return wrap(q)},batch(s){trips++;return DB.batch(s)}};
 function wrap(q){return {...q,bind(...a){return wrap(q.bind(...a))},all(){trips++;return q.all()},first(){trips++;return q.first()},run(){trips++;return q.run()}}}
 const data=await bootstrap({...e,DB:counted},"demo-author",{tab:"scores"});assert.equal(trips,3);assert.deepEqual(data.notifications,[]);assert.deepEqual(data.announcements,[]);
 }finally{e.DB.close()}
});
test("十张图片提交成功且写确认返回紧凑结果，不再重复传输配图和历史附件",async()=>{
 const e=await fixture();try{
 const images=Object.fromEntries(Array.from({length:10},(_,i)=>["img-"+(i+1),"data:image/png;base64,aGVsbG8="])),content=draft.content+"\n"+Object.keys(images).map(id=>"![配图](narv-image:"+id+")").join("\n"),d={...draft,content,images};
 const {result:s}=await run(e,"demo-author","create",[d]),response=await run(e,"demo-author","action",[s.id,"submit",d]);
 assert.equal(response.result.status,"submitted");assert(!Object.hasOwn(response.result,"images"));assert(!response.result.versions[0].images);assert.equal(response.profile.user.id,"demo-author");assert(response.recordVersions["submissions/"+s.id]>1);
 assert.equal(Object.keys((await load(e.DB)).state.submissions[0].versions[0].images).length,10);
 }finally{e.DB.close()}
});
test("静态公开图片地址仍生成图片节点",()=>{const url="./content/media/"+"a".repeat(64)+".jpg";assert.match(markdown("![图](narv-image:img-1)",{"img-1":url}),/<img src="\.\/content\/media/)}); 
