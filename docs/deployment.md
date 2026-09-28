# 接通真实账号与后端

2026-09-28。当前已经完成前后端 API 联调、SQLite 持久化、服务端权限和 GitHub OAuth 流程实现。已创建远程 D1 并迁移、部署 Cloudflare Worker；GitHub OAuth App、远程仓库和前台发布仍未完成。OAuth 回调以模拟 GitHub 响应测试；真实授权需完成下述配置后验收。

## 用户目前需要做什么

1. 在 https://dash.cloudflare.com/sign-up 注册免费账号，完成邮箱验证。保持 Workers Free，不开通付费计划，无需购买域名或对象存储。
2. 用 GitHub 账号创建仓库，例如 DR-NEKO/NARV。这里的名字只是建议；当前连接账号的 numeric ID 为 143079338，已填入最高编辑的部署配置。仓库名字变更时同步修改站点路径。
3. 在终端执行 npx wrangler login，浏览器授权给本人 Cloudflare 账号。这一步需要本人操作。
4. 后续 OAuth Client Secret 通过终端的 secret 提示输入，不要发送到聊天、不要写入公开文件。

GitHub Pages 可以直接用 github.io。免费后端选用 Worker + D1；当前少量压缩配图也保存在受权限检查的 D1 稿件记录中，没有 R2 费用。前端构建只复制 public/，不会上传数据库、后台 Secret 或草稿。

## 创建并部署后端

先在项目根目录执行 npm ci，然后：

```sh
npx wrangler login
npx wrangler d1 create narv
```

将返回的 database_id 填入 backend/wrangler.toml。确认 FRONTEND_URL 包含正确的 GitHub Pages 仓库路径。API_URL 填入本人 Worker 的 HTTPS 地址。

```sh
npm run db:migrate
npm run deploy:api
```

第一次部署可以暂不配置 OAuth，此时 /health 的 authConfigured 为 false。部署成功后确认 API_URL 与实际地址一致，重新部署。

然后在 https://github.com/settings/developers 创建 OAuth App：
- Homepage URL：实际的 GitHub Pages 首页。
- Authorization callback URL：实际 API 地址 + /auth/callback。
- Client ID 填入 backend/wrangler.toml 的 GITHUB_CLIENT_ID。
- Client Secret 通过以下命令输入：

```sh
npx wrangler secret put GITHUB_CLIENT_SECRET --config backend/wrangler.toml
npm run deploy:api
```

Original Editor 仅由配置中的 GitHub numeric ID 在首次注册时获得，不采用“第一个访问者就是管理员”。不使用 GitHub 昵称、邮箱、头像做公开署名，登录后在“双身份设置”中配置。

## 发布前端

提交到选定的 GitHub 仓库，在 Settings → Pages 中选择 GitHub Actions。设置仓库 Actions variable：

```text
NARV_API_URL=https://实际的-worker.workers.dev
```

Pages 工作流会把此地址写入构建目录的 config.js，并启用真实 API 模式与 CSP。未提供该变量时构建仍是本地演示模式，不能当作真实服务发布给投稿者。

线上模式不会显示演示账号切换，也不把本地演示数据导入线上。收藏、评论、稿件、权限与消息都从 API 读取；本机自动暂存独立隔离，点击“暂存草稿”会写入服务端。

## 上线前的实际验收

- 从真实 GitHub 授权回站，确认最高编辑与第二个普通账号的权限；退出后旧会话无效。
- 分别检查手机／校园网访问、浏览器第三方 cookie 限制下的登录，以及回调过期后的重新登录。
- 使用不同真实账号完成投稿、审稿、退修、录用、发表、评论审核、收藏与身份查询。
- 关闭浏览器后确认后台定时发表；配置 cron 是每分钟一次，不承诺秒级准点。
- 确认公开 bootstrap 没有草稿、待审核评论、内部主体 ID、GitHub 标识和身份映射。
- 在 Cloudflare 运行日志检查 CPU、错误率与额度；通过实际负载验收后才开放征稿。
- 完成有效平台联系方式、纠错渠道、隐私保留与用户数据处理说明。

## 已实现的边界

- GitHub OAuth 使用 state、HttpOnly/Secure/SameSite=Lax 绑定 cookie 和 S256 PKCE；前端还使用独立 PKCE 交换单次 60 秒 ticket。GitHub access token 仅用于核验账号，不持久化。
- NARV 会话有效期 12 小时，只在 sessionStorage 中保存；数据库保存其哈希。GitHub Pages 与 workers.dev 不依赖跨站第三方会话 cookie。
- 每次写操作按数据库中当前账号权限执行；快照返回字段经过裁剪。身份对应关系仍必须提交理由才能查询，并记录审计和通知。
- D1 使用事务和全局修订号防止并发覆盖。发生冲突返回 409，刷新后重新操作，不静默覆盖他人修改。
- 内容以独立记录和分块存储，避免单行超过 D1 限制。当前试运行实现仍会整体读取数据再裁剪，不适合大规模使用。
- 当前硬限制：100 个账号、每账号 50 篇稿件、全站业务数据 8 MB、每次请求 1.6 MB、单次写入最多 40 条语句；每账号每分钟 30 次写操作。全站 8 MB 是主动试运行门槛，远低于 D1 服务额度。
- 达到限制明确失败，不会自动升级为付费。全站读取、附件版本占用、配额提示、索引分页和分表查询仍需要后续优化。
- 对外开放前需要完成备份恢复演练；目前可用 wrangler d1 export 做管理员数据库备份，尚未提供站内自助恢复界面。

## 本地开发与验证

```sh
npm test
npm run dev
npm run dev:api
npx wrangler deploy --dry-run --config backend/wrangler.toml
```

4173 是原有浏览器本地演示；4174 是相同 Worker 逻辑 + 本机 SQLite 的联调入口。4174 不包含登录后门或可切换演示身份；真实 OAuth 需要配置 HTTPS 回调。自动浏览器验收使用独立临时数据库、独立会话和 4175 端口，测试进程退出后关闭服务。

Windows 的 SQLite 数据在系统临时目录 narv-local-api 下，避免 WSL 网络路径文件锁问题；WSL 下为项目 .local/。可用 NARV_DATA_DIR 指定持久目录。该本地目录不是正式生产数据库。

## 核实依据

- [GitHub OAuth 与 PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [D1 batch 事务](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 限制](https://developers.cloudflare.com/d1/platform/limits/)
- [Workers 计费与免费计划](https://developers.cloudflare.com/workers/platform/pricing/)

以上是实现和本地验证记录，不能替代尚未进行的真实 Cloudflare 部署、GitHub 授权和免费计划负载验收。

## WSL 网络排障（2026-09-28）

本机 Windows 代理监听 127.0.0.1:7980；WSL 直连 Cloudflare API 超时。项目根目录及 backend/.env 已设置 HTTPS_PROXY=http://127.0.0.1:7980，两个本机配置均被 .gitignore 排除。更换代理端口后需更新这两处配置；无需关闭 TLS 校验。

可临时验证：HTTPS_PROXY=http://127.0.0.1:7980 npx wrangler d1 list。D1 narv 已在本人 Cloudflare 账号创建并绑定到 backend/wrangler.toml。

## 线上进度与地址分工

后台已部署：https://narv-api.dr-neko-narv.workers.dev 。/health 实测返回 200，ok=true、authConfigured=false；等待 GitHub OAuth Client ID 与 Secret。

前台计划仍为 https://dr-neko.github.io/NARV/ ，使用 GitHub Pages。workers.dev 仅承载 API，不替代前台 github.io 地址。OAuth App 的回调地址应填写 https://narv-api.dr-neko-narv.workers.dev/auth/callback 。GitHub 仓库与前台尚未发布。
