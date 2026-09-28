import {actorScope} from "./scopes.js";
import {select,appendHeads} from "./repository.js";
import {rank} from "../public/roles.js";
export async function articleState(env,userId,id){
 const before=await actorScope(env.DB,userId),u=before.state.users.find(x=>x.id===userId);
 appendHeads(before,await select(env.DB,"kind IN ('bookmarks','votes') AND owner_id=? AND article_id=?",[userId,id],{limit:2}));
 appendHeads(before,await select(env.DB,"kind='comments' AND article_id=? AND (owner_id=? OR (status='pending' AND ?>=1))",[id,userId,rank(u)],{limit:100}));
 const comments=before.state.comments.map(c=>c.authorId===userId?{...c,avatar:u.community.avatar}:{...c,authorId:"comment-author:"+c.id,avatar:"◈",history:undefined,versions:undefined,reviewedBy:undefined});
 const counts=await env.DB.prepare("SELECT up,down FROM vote_totals WHERE article_id=?").bind(id).first()||{up:0,down:0};
 return {revision:before.revision,comments,myComments:comments.filter(c=>c.authorId===userId),bookmarks:before.state.bookmarks,voteTotals:{[id]:{...counts,mine:before.state.votes.find(v=>v.articleId===id)?.value||0}},recordVersions:before.versions};
}
