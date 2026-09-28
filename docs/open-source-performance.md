# 性能设计与开源参照

本轮直接采用 Grafana k6 v2.3.0 官方 Linux 二进制进行压测（下载后验证官方 SHA-256）。工具仅保存在忽略的 artifacts/k6，无云端订阅，也不进网站包。

- 脚本：scripts/load-readers.k6.js；静态测试源：scripts/capacity-origin.mjs。
- ramping VUs：10 秒升至 5,000，维持 15 秒，5 秒降载；读者读取目录／文章，10% 读取公开搜索包，阅读间隔 5–15 秒。初次连接会影响时长，实际完整执行约 52 秒。
- 本机验收：峰值 5,000 VUs，31,743 请求，0 失败，P95 2.57 ms，P99 4.25 ms；传输约 1.3 GB。测试源不含 D1 或 Worker。
- 报告：artifacts/k6-readers.txt 和 artifacts/k6-readers.json（不入库）。这是本机静态 HTTP 性能，不能当作 GitHub／Cloudflare 的 SLA 或真实网络时延。
- 原始一次性 5,000 TCP 冷连接检查也保留，但本机临时端口范围只有约 4,096 个，导致初次失败；分开源 IP 后成功，却有重传／冷连接时延。主要性能判据使用 k6 的阶段模型及连接复用，保留较慢结果供复现，不挑选最佳单次结果。

公共冷缓存请求合并借鉴 Go x/sync/singleflight 的并发重复请求抑制：同一规范 URL 的多个调用等待同一个 Promise，完成或失败后移除。独立编写 JavaScript 实现，没有复制 Go 源码。合并范围是一台 Worker isolate，跨 isolate／地区仍可能分别读 D1。Cache API 命中仍计 Worker 请求；主要阅读直接从 Pages 静态文件获得。

搜索架构参考 Pagefind 的构建时索引、静态分块、浏览器检索，避免每个查询调用后端。目前保留 NARV 已验证的中文错字、公开回应和日期筛选算法；Pagefind 对当前 hash SPA 不能直接索引到独立文章，整套替换需要先生成逐篇 HTML，并验证现有匹配语义。下一阶段文章量增大时评估 Pagefind／MiniSearch 的倒排索引，以及 Web Worker 避免检索阻塞界面。

写入采用成熟数据库做法：索引定位、记录级乐观锁、事务批处理、唯一约束、只追加积分事件。不同用户独立写入不会争夺全站版本锁；同稿过期修改明确拒绝。D1 本身仍串行执行，当前设计不声称支持 5,000 并发写入。

官方来源：
- https://github.com/grafana/k6
- https://grafana.com/docs/k6/latest/using-k6/scenarios/
- https://github.com/golang/sync/blob/master/singleflight/singleflight.go
- https://pagefind.app/
- https://pagefind.app/docs/filtering/
