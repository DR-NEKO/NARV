# NARV 部署与恢复

更新：2026-09-28，本轮容量／治理升级已部署后端，前端由 main 的 Pages 工作流发布。

- 网站：https://dr-neko.github.io/NARV/
- API：https://narv-api.dr-neko-narv.workers.dev
- 仓库：https://github.com/DR-NEKO/NARV
- GitHub Pages 承载界面和公开文章／评论／搜索／媒体文件；Workers + D1 承载私有账号、稿件与治理。
- 当前采用免费计划，没有自建服务器、付费域名、R2 或付费审核服务。

## 常规更新

在仓库根目录执行：

~~~sh
npm ci
npm test
npm run db:migrate
npm run deploy:api
~~~

推送 main 后，GitHub Actions 测试／构建／发布 Pages；另有每 15 分钟的定时构建，GitHub 调度可能延迟，不能保证严格 15 分钟内同步。仓库 variable NARV_API_URL 为 API HTTPS origin。公开静态内容包只从白名单只读接口导出，不导出账号、草稿、未公开评论或审稿记录。匿名常规阅读／检索无 Worker 请求；尚未同步的新文章直接链接可从公共 API 回退读取。登录读者获取实时互动状态。

首次新部署需要本人 Cloudflare 免费账号、D1 和 GitHub OAuth App。wrangler.toml 配置公开 Client ID、指定 OE GitHub numeric ID、FRONTEND_URL、API_URL；Secret 用官方 CLI 设置，不发送聊天：

~~~sh
npx wrangler secret put GITHUB_CLIENT_SECRET --config backend/wrangler.toml
node scripts/set-identity-secret.mjs
~~~

OAuth 回调 URL 是 API /auth/callback。IDENTITY_PEPPER 用来 HMAC GitHub 登录绑定；保留 .local/identity-pepper 的私有安全副本，恢复时必须使用相同值。普通代码部署不要重置或旋转这个密钥。身份关联查询只返回站内两套身份，不返回 GitHub 标识、头像、邮箱或令牌；Editor 及以上查询需要理由并审计／通知。

## 存储／安全界限

- 独立记录索引、按用户／页面／稿件读取；版本和图片按需获取。
- 文本 gzip，图片 SHA-256 去重。未引用私有 blob 超过一天后清理；公开引用保留。
- 每账号最多 200 篇保留稿件；每请求 1.6 MB；每次事务最多 48 条语句。
- 不再有 100 账号／8 MB 的旧试运行门槛。压缩记录＋blob 业务容量主动限制 300 MiB，留出索引、公共投影、会话和数据库开销；不等于 D1 文件尺寸的精确上限。
- 记录级乐观锁＋事务／唯一约束；不同用户独立写互不因全站版本号冲突，同稿过期操作返回 409。
- 账号写接口每分钟 30 次；OAuth／匿名写入口每 IP 每分钟 300 次；公共缓存未命中读取有 isolate 内的宽松限流（校园 NAT 下每 IP 6000/min）。它不是分布式 WAF，不能保证挡住换 IP 抓取。
- API 无搜索引擎索引、安全响应头、规范缓存 URL。公开内容仍能被访问者复制／抓取，站点不能承诺绝对反爬。
- 会话 12 小时，仅浏览器 sessionStorage；服务器存哈希。GitHub access token 仅用于核验后丢弃。
- 定时发表和支持积分奖励每分钟处理，最多一批 5 篇到期稿件和 1 篇支持奖励，满负载含清理共 49 条 D1 语句；集中发表／奖励会排队；发布奖励 +2，每稿同一审稿人 +1，支持奖励只追加到新高，总额上限 10。积分不自动提权。
- OE 不做普通审稿。Editor 拒稿上诉由 OE 流程仲裁，再安排独立 Editor。
- 免费额度及容量验收见 capacity-plan.md、open-source-performance.md。不能保证 5,000 人持续高频读写免费无限运行。

## 业务备份与恢复演练

~~~sh
npm run backup
~~~

导出 records、revision、索引实体、blob、引用、公共投影、积分／支持／投票计数。脚本在一个全新的本机数据库恢复、解压 JSON、验证附件引用；不导出 auth 或 rate_limits。备份 SQL、恢复数据库及报告位于被忽略的 .local/backups/，权限 600，不进入 GitHub／Pages。恢复后用户重新登录。没有站内一键恢复；真实恢复要先维护停写，并使用同一 HMAC 密钥。

旧 v1 → v2 的一次性升级：
1. 备份；db:migrate 应用 0002。
2. 部署 --var MAINTENANCE:1 的后端，暂停私有操作及 cron，保留 auth。
3. node scripts/migrate-storage.mjs 导出新鲜业务快照、本地转换与重建索引、检查版本后上传，保留内部账号 ID 和会话。
4. 常规部署清除维护标志，再检查聚合账号／OE／会话数量和公开接口。

升级脚本不用于日常部署，也不能在正常写入期间运行。本机代理环境的 workerd 远程绑定受 restrictPeers 限制，因此迁移走 Wrangler 官方 HTTPS CLI，并先本地转换验证，不读取或输出 Cloudflare 认证令牌。

## 本机网络和测试

WSL 使用 HTTPS_PROXY=http://127.0.0.1:7980；CLI 需要显式传递进程环境。不要关闭 TLS 校验。直接 Node fetch 构建使用：

~~~sh
HTTPS_PROXY=http://127.0.0.1:7980 NARV_API_URL=https://narv-api.dr-neko-narv.workers.dev node --use-env-proxy scripts/build.mjs
~~~

4173 是本地演示，4174 是 Worker 逻辑＋SQLite 联调。浏览器验收使用独立 4175 和临时数据库／测试会话；不替换生产数据。Windows SQLite 数据放系统 temp，避免 UNC 文件锁。实际 workerd + D1 本地迁移／权限／cron 另有 runtime check。k6 本机负载脚本禁止指向公开云端，避免消耗生产免费额度。
