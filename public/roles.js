export const ROLES=["user","temporary_reviewer","resident_reviewer","ae","editor","original_editor"];
export const ROLE_NAMES={user:"普通用户",temporary_reviewer:"临时 Reviewer",resident_reviewer:"常驻 Reviewer",ae:"AE",editor:"Editor",original_editor:"Original Editor"};
export const rank=u=>ROLES.indexOf(typeof u==="string"?u:u?.role);
export const initialUsers=[
{id:"demo-author",name:"林序",role:"user",background:"计算机方向，喜欢记录学习与研究过程。"},
{id:"demo-temp",name:"沈初",role:"temporary_reviewer",background:"关注学习方法与课程实践。"},
{id:"demo-reviewer",name:"许知",role:"resident_reviewer",background:"科研复盘与学术写作。"},
{id:"demo-ae",name:"程砚",role:"ae",background:"负责科研与实践栏目。"},
{id:"demo-editor",name:"编辑部",role:"editor",background:"内容质量与刊物运营。"},
{id:"demo-original",name:"创始编辑",role:"original_editor",background:"NARV 唯一最高权限账号。"},
{id:"demo-editor-2",name:"编辑 · 南",role:"editor",background:"用于体验独立多人认可。"},
{id:"demo-editor-3",name:"编辑 · 北",role:"editor",background:"用于体验独立多人认可。"}
];
export const POLICY={version:"2026-09-27.v2",reviewerReviews:5,reviewerContributions:3,appealWindowDays:90,appealCount:3,appealRatio:.5,qualityCount:3};
export const STATUS={draft:"草稿",submitted:"待审阅",reviewing:"审稿中",revision:"待修订",accepted:"已录用 · 待作者发表",scheduled:"待定时发表",published:"已发表",arbitration:"待 OE 仲裁",rejected:"未录用",withdrawn:"已撤回",retracted:"已撤稿"};
export const CONSENTS=[
{id:"responsibility",label:"我理解稿件仅代表本人观点，愿依法对内容与权利来源承担相应责任，已阅读并理解平台责任边界。"},
{id:"original",label:"我确认稿件为本人原创或已获授权，引用和配图已注明必要来源。"},
{id:"privacy",label:"我已检查内容中的个人信息与敏感材料，不公开未经允许的他人隐私。"},
{id:"policy",label:"我已阅读投稿须知与平台说明，理解审稿、上诉、公开发表和更正撤稿规则。"}
];
export function consentValid(c){return !!c&&CONSENTS.every(x=>c[x.id]===true)}
