# 初稿验证记录

2026-09-27：25 项 Node 行为测试通过；独立 Chromium 上下文中的完整桌面／手机交互验收通过，未观察到页面脚本或控制台错误。

## 已实际验证

- 标题／正文／评论命中、日期筛选、少量错字容忍、非公开评论排除。
- 草稿恢复、图片压缩插入、公式预览与必选责任确认。
- 临时 Reviewer 拒稿 → 作者向高一级复审 → 原审稿人不可处理 → 常驻 Reviewer 录用。
- 录用后仅作者安排定时、取消定时与立即发表。
- 投稿使用独立署名，文章不显示另一套昵称；Editor 查询身份需理由，AE 无查询入口。
- 收藏按账号隔离；赞与踩互斥、可取消；中长评论经另一名权限账号审核后公开并被检索。
- 3 名不同 Editor 认可普通用户进入临时 Reviewer。
- 通知已读状态、私密审稿通知与公告权限。
- 手机 390px 视口无横向溢出；标题加载本地 Noto Serif SC，公式加载本地 KaTeX。

## 边界

- 这些结果验证本地原型的行为，不证明生产服务安全。
- 真实 GitHub OAuth、数据库授权、并发多用户、浏览器关闭后的定时服务尚未实现，因而未进行线上验收。
- 字体与公式库包含本地许可证；Logo 使用内置 image_gen 生成，未声明不可验证的具体模型版本。
- 本机预览已改由 Windows Node 读取 WSL 源码，保留 http://localhost:4173，以避免 WSL localhost 转发的资源加载异常。

浏览器截图位于 artifacts/，该目录不随网站发布。端到端脚本 scripts/browser-check.cjs 使用独立临时上下文，不修改用户正在预览的浏览器数据。
补充：身份查询日志计数即时更新已验证。可选 WebMCP 公开搜索接口在模拟注册环境中验证了合法输入、非法输入和只读状态；当前浏览器不支持原生 WebMCP，真实支持环境下的验证不可用。


## 2026-09-28：图片编辑与阶段梳理

- 29 项 Node 测试通过，新增旧内嵌图片转换、短引用还原、缺失／危险附件验证、提交版本的附件隔离。
- scripts/image-check.cjs 在独立 Chromium 上下文通过：剪贴板粘贴、拖放、修改说明、预览与移除同步、刷新恢复、保存后重新编辑、提交、可携图的 Markdown 导出、公开文章配图、旧草稿转换、390px 视口无横向溢出。
- scripts/browser-check.cjs 完整投稿／复审／发表／互动／权限与通知流程回归通过，无页面脚本或控制台错误。
- 正文只保留 narv-image:img-N 短引用；本地图片数据独立保存在稿件与版本附件中，并未上传到云端。公开文章只带正文实际引用的附件，撤稿不返回配图。
- Markdown 导出会还原内嵌图片，确保文件可携带配图；编辑栏始终使用短引用。
- 已检查 artifacts/image-editor-short-reference.png 的实际布局。完整缺项、流程断点与下一阶段顺序见 ../ROADMAP.md。

## 2026-09-28：个人中心、API 与认证实现

- 36 项 Node 测试通过。新增实际 SQLite 查询／事务、并发领取冲突、服务端越权拒绝、双身份字段裁剪、评论重提撤回、修订草稿隔离、降级交接、后台发表幂等、OAuth state／cookie／PKCE、单次交换、退出和指定最高编辑。
- scripts/browser-check.cjs 完整演示流程回归通过。
- scripts/backend-browser-check.cjs 在独立临时数据库与临时会话中通过：真实模式无演示切换、我的已发表帖子、收藏与取消、评论退回／修改／通过／撤回、数据库草稿刷新恢复、不同账号和手机布局。
- 实际 Cloudflare workerd + 本地 D1：迁移成功，公开 bootstrap、CORS、无登录写入拒绝和 scheduled handler 通过。最初默认调试端口被占用，改用 8797／9297 后验证通过。
- Wrangler 4.142.0 deploy --dry-run 编译通过。演示与 API 两种前端构建均成功；API 构建使用明确 API 地址并生成 CSP。
- 检查 artifacts/my-comments-api.png 的实际布局，评论状态、审核记录与原文入口显示正常。

真实 GitHub 授权、远程 Cloudflare D1、校园网与免费计划性能还未验收。OAuth 测试使用模拟的 GitHub 服务响应，浏览器联调用测试会话，不代表已经接通本人线上账号。部署依赖和容量限制见 deployment.md。


## 2026-09-28：首次远程部署

通过本机 HTTP 代理恢复 Wrangler 与 Cloudflare API 的连接；远程 D1 narv 创建并执行 0001_initial.sql 成功。narv-api 已部署并配置每分钟 cron，实际 /health 返回 HTTP 200、ok=true、authConfigured=false。真实 GitHub 授权和 github.io 前台发布尚未完成。


## 2026-09-28：Pages 发布与 OAuth 配置

GitHub Actions 测试／构建通过，启用 Pages 后重试部署成功。scripts/live-smoke.cjs 对线上网站验证 HTTP 200、API 模式配置、跨站 bootstrap、无演示角色切换、登录入口、关于页、字体和手机无横向溢出。scripts/live-auth-smoke.cjs 验证真实 API 302 到 GitHub、预期 Client ID 与回调、S256 PKCE、HttpOnly／Secure／SameSite 绑定 cookie 和 GitHub 登录页面。health 返回 authConfigured=true。完整授权回站与真实账号仍待本人登录验收。


## 2026-09-28：真实账号与首轮业务备份

远程 D1 聚合查询确认：accounts=1、original_editors=1、active_sessions=1。这证明真实 GitHub 回调、站内凭据交换及指定最高编辑身份已走通；未读取或输出会话令牌。npm run backup 的业务表导出与独立本地恢复通过，所有业务记录 JSON 完整，恢复后的登录会话为 0。备份保存在 .local/backups/，不会随 GitHub 代码或 Pages 发布。
