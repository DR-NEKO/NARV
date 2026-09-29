import {face} from "./identity.js";
const mdText=value=>String(value||"").replace(/\s+/g," ").replace(/[\\`*_{}\[\]()#+.!|>~$]/g,"\\$&");
const titleLine=title=>"# "+mdText(title.trim()||"文章标题");
const authorLine=(u,side)=>"**作者：** "+mdText(face(u,side).name);
export function newManuscriptTemplate(u,side="community"){
 const templateTitleLine=titleLine(""),templateAuthorLine=authorLine(u,side);
 return {templateTitleLine,templateAuthorLine,content:[
 templateTitleLine,"",templateAuthorLine,"","---","",
 "## 背景与问题","","在这里交代背景、讨论的问题，以及它为什么值得关注。","",
 "### 具体问题","","说明希望回答的问题、适用对象与必要条件。","",
 "## 分析与依据","","展开你的主要观点，给出具体案例、材料或推导，并注明引用来源。","",
 "### 关键证据","","说明证据支持了什么，以及仍然不能说明什么。","",
 "## 结论与局限","","总结你的判断，交代适用边界、尚未解决的问题与后续方向。","",
 "## 参考与致谢","","列出引用来源、配图出处与需要致谢的贡献。"
 ].join("\n")};
}
export function updateTemplateFields(draft,u,field){
 const lines=draft.content.split("\n");
 if(field==="title"&&draft.templateTitleLine){
  if(lines[0]===draft.templateTitleLine){draft.templateTitleLine=titleLine(draft.title);lines[0]=draft.templateTitleLine}
  else delete draft.templateTitleLine;
 }
 if(field==="identity"&&draft.templateAuthorLine){
  const index=lines.indexOf(draft.templateAuthorLine);
  if(index>=0){draft.templateAuthorLine=authorLine(u,draft.identity);lines[index]=draft.templateAuthorLine}
  else delete draft.templateAuthorLine;
 }
 draft.content=lines.join("\n");
}


export function resumeTemplateFields(draft,u,originalAuthor){
 const lines=draft.content.split("\n"),author="**作者：** "+mdText(originalAuthor||face(u,draft.identity).name);
 if(!draft.templateTitleLine&&lines[0]===titleLine(draft.title))draft.templateTitleLine=lines[0];
 if(!draft.templateAuthorLine&&lines[2]===author)draft.templateAuthorLine=author;
}
