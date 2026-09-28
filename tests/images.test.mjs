import test from "node:test";
import assert from "node:assert/strict";
import {compactImages,prepareImages,expandImages,imageReferences} from "../public/images.js";
import {markdown} from "../public/ui.js";
import {evolve} from "../public/workflow.js";
import {publicArticle} from "../public/identity.js";
import {initialUsers} from "../public/roles.js";
const png="data:image/png;base64,aGVsbG8=";
const ref="![实验装置](narv-image:img-1)";
test("旧稿件图片压缩成短引用，转换幂等且原图可还原",()=>{
 const original="正文\n\n![实验装置]("+png+")";
 const compact=compactImages(original);
 assert.equal(compact.content,"正文\n\n"+ref);
 assert.equal(compact.images["img-1"],png);
 assert.deepEqual(compactImages(compact.content,compact.images),compact);
 assert.equal(expandImages(compact.content,compact.images),original);
 assert.equal(imageReferences(compact.content)[0].caption,"实验装置");
});
test("附件随稿件验证，缺失阻止提交、危险来源拒绝、无引用附件不公开",()=>{
 assert.throws(()=>prepareImages(ref,{},true),/缺失/);
 assert.doesNotThrow(()=>prepareImages(ref,{},false));
 assert.throws(()=>prepareImages(ref,{"img-1":"javascript:alert(1)"},true));
 assert.throws(()=>prepareImages(Array(4).fill(ref).join("\n\n"),{"img-1":png},true),/最多/);
 const images={"img-1":png,"img-2":png};
 assert.deepEqual(prepareImages(ref,images,true).images,{"img-1":png});
 const s={id:"a",content:ref,images,status:"published",publishedAt:"2026-09-28",author:"测试"};
 assert.deepEqual(publicArticle(s).images,{"img-1":png});
 assert.deepEqual(publicArticle({...s,status:"retracted",retractionNote:"撤稿"}).images,{});
 assert(!markdown(ref,{"img-1":"javascript:alert(1)"}).includes("<img"));
});
test("图片短引用可预览，说明安全转义，旧正文仍可阅读",()=>{
 assert.match(markdown(ref,{"img-1":png}),/<figure><img/);
 assert.match(markdown("![<script>](narv-image:img-1)",{"img-1":png}),/&lt;script&gt;/);
 assert.match(markdown("![旧图片]("+png+")"),/<figure><img/);
 assert.match(markdown(ref),/附件缺失/);
});
test("提交版本独立保存附件，下一版本替换不污染历史",()=>{
 const author=initialUsers[0],data={title:"图片测试",summary:"足够长度的摘要用于检查图片版本。",category:"学习与课程",content:"正文内容。".repeat(20)+"\n\n"+ref,images:{"img-1":png},consents:{original:true,privacy:true,policy:true,responsibility:true}};
 const draft={id:"image-test",authorId:author.id,status:"draft",version:0,requiredRank:1,round:1,versions:[],reviews:[],requests:[],appeals:[],conflicts:[],consents:[],history:[]};
 let s=evolve(draft,"submit",author,data);
 data.images["img-1"]="data:image/png;base64,d29ybGQ=";
 assert.equal(s.versions[0].images["img-1"],png);
 s=evolve(s,"submit",author,data);
 assert.equal(s.versions[0].images["img-1"],png);
 assert.equal(s.versions[1].images["img-1"],data.images["img-1"]);
});
