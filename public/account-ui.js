import * as db from "./client.js";
import {rank,ROLE_NAMES} from "./roles.js";
import {face} from "./identity.js";
import {canManage,suspended} from "./moderation.js";
import {esc,area,field,empty,when,toast} from "./ui.js";
const refresh=()=>document.dispatchEvent(new Event("narv:refresh"));
export function accountControls(u,target){
 let html="";
 if(canManage(u,target))html+='<details class="mt"><summary>封禁与解封</summary><form class="suspension-form" data-id="'+target.id+'"><label class="form-field"><span>处理方式</span><select name="action"><option value="temporary">临时封禁</option><option value="permanent">永久封禁</option><option value="restore">解除封禁</option></select></label>'+field("临时封禁截止时间","until","","type=\"datetime-local\"")+area("处理依据","reason","",'required minlength="10" maxlength="2000"')+'<button class="btn danger">确认账号处理</button></form></details>';
 if(u.role==="original_editor"&&target.id!==u.id&&target.role!=="original_editor"){html+='<details class="mt"><summary>移交最高权限</summary><form class="transfer-oe-form" data-id="'+target.id+'">'+area("移交说明","note","",'required minlength="10"')+'<p class="small-print">唯一 OE 权限将移交给该账号；你将成为 Editor。</p><button class="btn danger">移交 OE 权限</button></form></details><button class="btn danger mt" data-close-account="'+target.id+'">永久注销此账号</button>'}
 return html;
}
export function memberPanel(u,member,articles=[]){
 if(!member)return empty("账号不存在或不可访问","请返回账号搜索。");
 const p=face(member,"review");
 return '<section class="panel"><div class="row-top"><h2>'+esc(p.name)+'</h2><span class="label">'+ROLE_NAMES[member.role]+'</span></div><p class="uid-tag">UID '+esc(p.uid)+'</p><p class="small-print">贡献积分 '+db.userMetrics(member.id).points+' · '+(suspended(member)?'封禁中'+(member.suspension?.until?'，至 '+when(member.suspension.until):'（永久）'):'账号正常')+'</p>'+(member.suspension?'<p>处理依据：'+esc(member.suspension.reason)+'</p>':'')+accountControls(u,member)+'</section><h2 class="section-label mt">以此独立身份发表的文章</h2>'+(articles.length?articles.map(a=>'<p><a href="#/article/'+a.id+'">'+esc(a.title)+'</a></p>').join(""):'<p class="small-print">暂无文章。这里不会展示另一套身份的投稿。</p>');
}
export function memberSearch(u){
 const params=new URL(location.hash.slice(1),"https://narv.local").searchParams;
 return '<form id="member-search" class="member-search"><label class="form-field"><span>按最新昵称或 UID 定位账号</span><input name="q" type="search" maxlength="80" value="'+esc(params.get("q")||"")+'" placeholder="独立昵称或 R-UID"></label><label class="form-field"><span>身份范围</span><select name="side"><option value="review">独立／审稿身份</option>'+(rank(u)>=4?'<option value="community" '+(params.get("side")==="community"?'selected':'')+'>社区身份（查询留痕）</option>':'')+'</select></label>'+(rank(u)>=4?field("社区身份查询原因","reason",params.get("reason")||"",'minlength="10" maxlength="2000" placeholder="仅搜索社区身份时填写"'):'')+'<button class="btn primary">搜索账号</button></form><p class="small-print">AE 及以上可查看独立身份资料；Editor 及以上可管理低等级账号。每页最多 50 个结果；同名账号用 UID 区分。</p>';
}
export function closureUI(u){return '<section class="panel danger-zone mt"><h2>账号安全</h2><button class="btn" data-action="logout">退出登录</button><details class="mt"><summary>永久注销账号</summary><p>注销将停用账号并删除站内稿件、评论、收藏、通知和个人资料。历史审批会解除身份关联。操作不可恢复，需要两次确认。</p>'+(u.role==="original_editor"?'<p>请先在账号管理中将 OE 权限移交给另一有效账号。</p>':'<button class="btn danger" data-close-account="'+u.id+'">永久注销我的账号</button>')+'</details></section>'}
export function contentDelete(u,kind,id){return rank(u)>=4?'<details class="mt"><summary>编辑处理：删除内容</summary><form class="content-remove-form" data-kind="'+kind+'" data-id="'+id+'">'+area("删除依据","reason","",'required minlength="10" maxlength="2000"')+'<p class="small-print">仅能处理权限低于自己的账号；文章永久下架，不开放修改或重投。</p><button class="btn danger">确认删除</button></form></details>':""}
document.addEventListener("submit",async e=>{
 const f=e.target;if(!f.matches("#member-search,.suspension-form,.transfer-oe-form,.content-remove-form"))return;e.preventDefault();const d=Object.fromEntries(new FormData(f)),button=f.querySelector("button");if(button.disabled)return;
 try{
 if(f.id==="member-search"){if(d.side==="community"&&d.reason.trim().length<10)throw Error("请填写至少 10 字身份查询原因。");const q=new URLSearchParams({q:d.q,side:d.side,...(d.side==="community"?{reason:d.reason}:{})});location.hash="#/workspace/members?"+q;return}
 button.disabled=true;
 if(f.matches(".suspension-form")){await db.suspendAccount(db.session(),f.dataset.id,{...d,until:d.until?new Date(d.until).toISOString():null});toast("账号处理已生效")}
 if(f.matches(".transfer-oe-form")){if(!confirm("移交后你将成为 Editor，确认继续？"))return;const target=db.account(f.dataset.id),uid=face(target,"review").uid;if(prompt("再次确认：输入接任账号的独立 UID "+uid)!==uid)throw Error("UID 不匹配，未移交。");await db.transferOE(db.session(),f.dataset.id,d.note);location.hash="#/workspace";toast("OE 权限已移交")}
 if(f.matches(".content-remove-form")){if(!confirm("确定删除此内容？"))return;await db.removeContent(db.session(),f.dataset.kind,f.dataset.id,d.reason);location.hash="#/workspace";toast("内容已下架")}
 refresh();
 }catch(err){toast(err.message)}finally{button.disabled=false}
});
document.addEventListener("click",async e=>{const b=e.target.closest("[data-close-account]");if(!b)return;if(!confirm("第一次确认：永久注销该账号并删除相关数据？不可恢复。"))return;b.disabled=true;try{if(await db.closeAccount(b.dataset.closeAccount)){refresh();toast("账号已注销，相关数据正在清理")}}catch(err){toast(err.message)}finally{b.disabled=false}});
