# PRTS 本地资料库

项目采用手动更新的静态快照。浏览器只读取本地发布文件，不在用户浏览时请求 PRTS，也不执行定时同步。原有 103 个精选档案、收藏 ID、地图路由及镜头逻辑继续保留。

## 仓库与图片包

Git 仓库包含源码、当前快照清单及其引用的全部目录、详情、搜索与覆盖报告，以及精选档案和地图图片。全量图片目录 `public/assets/library/` 通过固定版本 [library-assets-2026-09-30](https://github.com/yi1z/TerraExplorationArchive/releases/tag/library-assets-2026-09-30) 的分包分发。来源原文、API 缓存、未改写工作清单、原图和历史快照均不提交。

普通使用者在 `npm ci` 后运行：

```sh
# 下载、校验并安装完整图片；已安装且哈希正确时直接复用
npm run assets:download

# 核验已安装的发布图片，不需要原图或 PRTS 原文缓存
npm run assets:verify

# 只使用之前下载的合法分包；缺失时明确报错
npm run assets:download -- --offline
```

分包信息及逐文件 SHA-256 记录在 `resources/library-assets.json`。下载缓存位于被 Git 忽略的 `artifacts/library-assets/cache/`；工具先验证分包，在暂存目录解压并核对文件，成功后才替换现有图片目录。下载或校验失败可修复网络后重新执行，失败不会将未验证资源覆盖到已安装目录。不要把原始图片缓存当作发布图片包。

图片不是文字检索的前提：未安装全量包时仍可浏览当前资料快照、精选图片与地图，缺失的扩展图片使用占位。普通 `npm test`、`npm run typecheck` 与 `npm run build` 不依赖私有来源缓存。

## 文件与责任

| 位置                                  | 内容                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `data/prts/discovery.json`            | 从 Cargo、分类、索引及专题目录发现的来源页面与范围对账                        |
| `data/prts/cargo/`                    | PRTS 结构化表快照                                                             |
| `data/prts/raw/pages/`                | 含来源修订号与时间的原始页面缓存；不随网站发布                                |
| `data/prts/cache/`                    | 可恢复的 API 响应缓存；不随网站发布                                           |
| `data/prts/editorial*.json`           | 按 ID 关联的人工提要与来源版本；名称含 `pending` 的文件是工作清单，不直接发布 |
| `data/prts/embedded-identities.json`  | 保留在 Git 的稳定身份登记表；更新资料时不能重新按姓名分配 ID                  |
| `data/prts/support/`                  | 任务组件、时装来源等本地支持材料，可能含来源原文；不提交、不随网站发布        |
| `public/data/prts/manifest.json`      | 当前生效的资料版本、分类计数及分片位置                                        |
| `public/data/prts/snapshots/`         | 按版本保存目录、详情、搜索分片和覆盖报告；生效路径以清单为准                  |
| `public/data/prts/coverage.json`      | 供维护工具读取的覆盖报告副本；网站读取清单指向的版本化报告                    |
| `data/prts-assets/`                   | 静态美术发现清单、下载状态、原图与转换记录                                    |
| `public/assets/library/entries/`      | 每个条目的本地图像及署名元数据                                                |
| `public/assets/library/images/`       | WebP 派生图；不放大原始小图                                                   |
| `public/assets/library/manifest.json` | 全部已发布美术的来源、校验和与关联审计清单                                    |
| `resources/library-assets.json`       | Git 中的 Release 分包与逐文件校验清单                                         |

`manifest.status` 为 `partial` 时，网站必须显示仍在整理。目录页有名字、原文已下载、字段已解析、梗概已改写、美术已齐全是不同状态，不能相互替代。来源本身缺失、只提供模拟规则或尚无可靠摘要的情况会明确记录。

构建仅将当前 `manifest` 引用的目录、详情、搜索分片与覆盖报告复制到 `dist`，复制完成后才发布清单；根目录的覆盖报告副本和旧快照不打包。工作区中的历史快照保留，不自动删除。请等待资料与美术同步完成后再构建发布版本。

## 维护者：来源同步与重新生成

以下命令用于重新获取 PRTS 来源和制作资料，不是运行网站的安装步骤。离线重建需要已取得的 `discovery`、Cargo、原始页面及支持资料；来源核验与美术原图核验也依赖未提交缓存。刚克隆仓库时不能直接执行这些离线维护命令。来源同步脚本当前使用 `curl.exe`，请在提供该命令的维护环境中运行。

完成首次来源准备后，在项目根目录运行：

```powershell
# 首次发现、缓存原文并生成本地资料
node scripts/sync-prts.mjs

# 仅用已有缓存重建发布资料，不访问网络
node scripts/sync-prts.mjs --phase=build --offline

# 校验稳定 ID、来源、模板解析、技能与关联等数据约束
node scripts/prts/verify.mjs

# 更新来源版本
node scripts/sync-prts.mjs --refresh

# 已完成发现时，单独补齐原文缓存；之后仍需执行 build 阶段
node scripts/sync-prts.mjs --phase=raw

# 单独刷新任务组件、时装等补充来源（raw/all 也会执行）
node scripts/sync-prts.mjs --phase=support --refresh

# 静态美术发现与导入；已完成资源会复用
node scripts/prts-assets.mjs sync

# 重新检查美术来源版本（与资料正文的 refresh 独立）
node scripts/prts-assets.mjs sync --refresh

# 仅优先准备十二个主题入口
node scripts/prts-assets.mjs sync --priority

# 维护者原图核验：需要私有 originals 缓存；不同于 assets:verify
node scripts/prts-assets.mjs verify
```

网络导入使用有限并发、缓存、失败记录与重试；中途退出后重新执行会从缓存继续。来源改动并不自动证明新内容正确，更新后仍需检查解析与叙事缺口。美术转换依赖 `sharp`，构建网站本身不依赖图像转换器。

不带 `--refresh` 的再次执行优先复用 API 响应和原文缓存，适合续跑；它不保证检查到上游的新修订。`--refresh` 会重新获取发现目录与结构化表，并比较已有页面的修订号，仅下载新增或发生修改的正文。已移除页面会被记录，旧缓存不会自动删除。

发布前检查 `data/prts/discovery.json` 中的发现失败、`data/prts/incremental.json` 的变更及修订比较失败、`data/prts/raw/report.json` 的正文下载失败，以及清单指向的覆盖报告；仅有命令正常结束不足以证明收录完整。人工提要保留撰写时的来源修订号，重建会按 ID 继续合并，不会因上游更新自动重写或失效；需要对照变更清单人工复核并更新提要与出处。

开发服务器忽略批量生成目录的文件监听，避免触发大量热更新。`scripts/serve-library.ts` 仅在开发模式按请求直接读取 `public/data/prts/` 的 JSON 与 `public/assets/library/` 的 JSON／WebP，因此启动后新生成的文件也无需重启服务器。JSON 使用 `no-cache`，哈希命名的图片使用长期缓存，缺失文件返回 404。同步完成后手动刷新页面即可重新载入清单与内存索引；生产预览读取 `dist`，仍须在同步结束后重新构建。

人工提要文件和稳定身份登记表随源码保留，工作清单、原文及生成报告留在本地。更新 Git 快照时只纳入新清单实际引用的文件与覆盖报告副本；图片更新通过 `npm run assets:pack` 制作分包并同步校验清单，发布前完成下载与安装验证。发布版本和清单必须相互对应，不能用新的图片内容静默替换已发布的固定版本。

## 浏览器读取

应用先显示可用的精选资料，同时载入清单与目录。冷链接可按清单直接找到详情分片，无需等待全部目录。详细资料按需取得，仅保留六片 LRU 缓存；检索使用 Worker 倒排索引与紧凑的数字列表，界面每页 48 条，查询接口单页最多 80 条，总命中数可继续翻页。

同名角色、敌人、活动和地名通过稳定 ID 区分。原有 ID 不重新分配；不能仅靠标题去合并身份。来源可含同页多个实体，改写记录优先按 ID 关联。剧情提要及社区设定推演放在 `spoiler` 章节，关闭剧透时不加入可见正文搜索。

收藏、足迹和偏好使用 IndexedDB；少量偏好同时保存到 localStorage。旧 `terra-exploration.preferences.v1` 在当前 origin 尚无迁移标记时导入一次，迁移期间的新操作优先于旧记录。旧键会保留，但成功迁移后不会持续镜像收藏与足迹，不是实时备份。

IndexedDB 不可用时改用 localStorage；异步写入失败也会尝试立即保存最新状态，并保留存储错误提示。若此前已完成迁移，后来在回退期间更改记录，IndexedDB 恢复后不会自动合并这些回退记录，应在清理或迁移浏览器资料前分别保留两份存储。不同浏览器、域名或端口互不共享，也没有跨标签页实时合并、云同步或导出导入界面；清除站点存储会丢失本地记录。

## 美术与主题

网站提供源石、雪境、深海、莱茵、光环、巴别塔、耀光与水墨八组主题，选择规则显式登记在 `src/data/visual-profiles.ts`。匹配顺序为条目 ID、名称和来源页标题；同一来源页的模组或时装等资料也可能命中。主题不根据国家、种族或势力自动推断角色设定。

源图与页面背景效果分开处理。图像保持原貌，背景使用 SVG、CSS 和有限指针响应；没有为缺失的游戏角色补造插画。小屏、触屏、系统或站内减少动态效果偏好下提供静态表现；阅读弹窗开启后降低装饰强度。

## 来源与公开范围

条目保留 PRTS 页面链接、修订号与日期。来自多个页面的字段通过详情内的 `additionalSources` 记录补充出处；这些来源元数据随详情分片发布，点击来源链接才访问外站。时装目录、服饰介绍、获取与价格是不同资料范围，是否齐全应查看对应条目的缺口与覆盖报告，不能仅凭目录身份字段判定完成。

游戏基础数值、技能、关卡条件、材料配方等按源字段整理。完整剧本、语音和长篇档案原文不加入公开详情；叙事提要重新组织语言，并登记改写依据。来自社区考据的内容明确标识其性质，不把推测升级为官方事实。

游戏美术归鹰角网络及关联权利人，PRTS 托管不等于美术获得开放许可。社区文字遵循来源页所示许可与署名要求。进一步说明见 [THIRD_PARTY.md](THIRD_PARTY.md)。
