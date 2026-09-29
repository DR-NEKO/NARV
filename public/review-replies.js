export const reviewKey=r=>r.id||[r.version,r.round||1,r.date].join(":");
export function reviewItem(s,key,itemId){
 const review=(s.reviews||[]).find(r=>reviewKey(r)===key);
 if(!review)throw Error("审稿意见不存在。");
 if(itemId!=="overall"&&!(review.annotations||[]).some(a=>a.id===itemId))throw Error("这条批注不存在。");
 return review;
}
export function saveReviewReply(s,u,data,now,canEdit){
 if(!canEdit(s,u)||s.authorId!==u.id)throw Error("仅作者可在开放修改期间回复审稿意见。");
 reviewItem(s,data.reviewKey,data.itemId);
 if(typeof data.text!=="string"||data.text.length>5000)throw Error("每条回复最多 5000 字。");
 s.reviewReplyDrafts ||= [];
 const rows=s.reviewReplyDrafts.filter(r=>!(r.reviewKey===data.reviewKey&&r.itemId===data.itemId));
 if(data.text.trim())rows.push({reviewKey:data.reviewKey,itemId:data.itemId,text:data.text.trim(),updatedAt:now});
 if(rows.length>220)throw Error("回复条数超过上限。");
 s.reviewReplyDrafts=rows;s.updatedAt=now;
}
export function submittedReplies(s,nextVersion,now){
 return (s.reviewReplyDrafts||[]).map(r=>{
  reviewItem(s,r.reviewKey,r.itemId);
  return {...r,submittedVersion:nextVersion,submittedAt:now};
 });
}
