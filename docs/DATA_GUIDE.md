# 内容维护与结构

本页说明原有精选档案与地图的维护方式。当前扩展资料库采用 `LibrarySummary`／`LibraryDetail`、版本化 JSON 分片和 Worker 检索；其发现、整理、稳定 ID、更新与美术流程见 [PRTS 本地资料库](LIBRARY.md)。新增 PRTS 条目通过同步流程进入资料库，无需逐条加入 `catalogue.ts`。

## 内容与模块

原有精选目录包含 103 份档案：39 份世界观资料，加上 24 位干员、16 种敌人和 24 件道具。它们保留在新资料库中，继续服务首页与地图。所有内容为构建时的本地数据，没有运行时爬取或后台数据库。

| 模块                                                        | 职责                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/data/types.ts`                                         | `ArchiveEntry` 类型联合、各类结构化字段、来源、关系、地理与偏好契约 |
| `src/data/archive.ts`                                       | 原有 39 份世界观资料、统一目录／ID 索引、来源、事件及检索函数       |
| `src/data/catalogue.ts`                                     | 64 份新增档案、干员属性与技能、敌人能力、道具用途和配方             |
| `src/data/geography.ts`                                     | 导航示意轮廓、区域、城市锚点和导览顺序                              |
| `src/data/catalogue-assets.ts`、`src/data/assets.ts`        | 新档案与原地图两份本地图片清单的统一查找接口                        |
| `src/lib/state.ts`                                          | 路由、已打开档案、地图选择、检索条件、图层、导览与本地偏好          |
| `src/App.tsx`                                               | 资料／地图场景切换、悬浮目录、全局检索、偏好、关于与界面显隐        |
| `src/components/ArchiveTerminal.tsx`                        | 资料主舞台、立绘切换、详细阅读、双向关联展示                        |
| `src/components/ArchiveSearch.tsx`                          | 检索网格、分类筛选、收藏／足迹和临时预览                            |
| `src/components/EntryArtwork.tsx`                           | 按档案类型选图、图片失败占位、缩略图加载                            |
| `src/AtlasWorkspace.tsx`                                    | 按需加载的地图工作区、图层、导览、事件与国家对比                    |
| `src/components/TerraScene.tsx`、`src/components/Map2D.tsx` | 共用地理数据的 Three.js 与 SVG 地图                                 |
| `src/components/Dialog.tsx`                                 | 原生模态框、关闭行为及焦点恢复                                      |
| `src/terminal.css`                                          | 资料场景、检索和阅读浮层的视觉、动效与响应式布局                    |

`ArchiveEntry` 以 `kind` 区分 `country / city / faction / concept / operator / enemy / item`。公共字段包括稳定 ID、名称／英文／别名、摘要、事实列表、正文段落、来源与关联；干员、敌人、道具分别在 `operator`、`enemy`、`item` 字段存储其专属信息。地理字段只用于有依据的条目，不把干员出生地直接当成干员实时地图位置。

## 增加和核验资料

1. 先核对 PRTS 对应条目与适用的官方资料，记录来源 URL、发布方和核验日期；社区推测不能直接写成官方事实。
2. 世界观条目在 `archive.ts` 维护，游戏资料在 `catalogue.ts` 维护，后者由统一目录合并。使用稳定小写 ASCII ID，新增类型使用 `operator-`、`enemy-`、`item-` 前缀；保留已有 ID，避免破坏收藏和链接。
3. 基本设定放入摘要，重大剧情放入 `sections` 并标记 `spoiler: true`。正文检索必须通过 `visibleSections`；标记为剧透的关系也应受全站设置控制。摘要、标签、别名不能提前泄露折叠内容。
4. `related` 只使用现存条目 ID；需要关系含义时同时维护 `relationships` 的目标和标签。来源 ID 必须能在 `sources` 中解析。详情会合并显式关联与反向关联，关系依据应能在该档案来源中追溯。
5. 干员面板注明精英阶段、等级、潜能及信赖／模组／天赋口径；技能摘要注明适用等级。首版采用精二满级、潜能一、不计信赖与模组的基础面板，技能摘要按七级整理，特殊规则在条目说明中单独解释。
6. 敌人默认记录 PRTS 级别 0 基础属性；姿态、阶段、关卡参数与天赋加成另行描述。图鉴编号与代表关卡逐项核对，不混用同名敌人变体。
7. 道具的历史活动获取标记 `historical`，配方注明原料数量、产量、设施及龙门币成本。已收录原料使用 `entryId`，未收录原料使用来源 URL，不能为配方制造空白档案。
8. 缺少可靠数值时省略可选字段并用 `missingFacts` 说明，不填零伪装为已核实。新增国家／城市锚点需同步地理数据；来源不能确定位置的势力不创建地图点。
9. 更新来源与美术清单后运行类型检查、测试、构建与素材校验。数量发生变化时同步数据断言及文档；不要把当前测试总数写死在操作说明里。

## 路由、状态与存储

默认 `#/archive` 展示阿米娅。档案链接示例为 `#/archive?kind=operator&entry=operator-amiya`；可带 `q` 保存检索词、`filter` 保存有效的细分筛选。旧的 `#/atlas?entry=lungmen&layers=countries,cities` 继续支持，`favorites` 与 `about` 路由保留兼容入口。无效条目回落到默认内容并提示，不接受任意对象原型名称作为 ID。

`openEntry(id)` 打开资料舞台并记录阅读；地图 `select(id)`／`openAtlas(id)` 定位适用的世界观条目。把游戏档案 ID 传给地图选择会转到资料场景。`atlasSelected` 保存离开地图前的档案上下文，返回入口使用该选择；图层和全局检索状态由 store 保留。悬停／焦点预览与正式打开分离，不改变选择 URL、不记录阅读。

查询词、类别和细分筛选写入档案路由，查询变化使用替换历史，类别、细分筛选及正式打开使用新历史记录。浏览器返回／前进按路由恢复档案、类别、筛选、查询和图层，并停止旧导览。切换类别会清空不再适用的细分筛选；从资料进入地图再返回时保留检索上下文。搜索弹窗的预览、当前章节、立绘版本、菜单固定及界面显隐属于临时 UI 状态。

本地偏好键为 `terra-exploration.preferences.v1`，格式 `version: 1`，保存收藏、足迹、剧透、减少动态效果和音效开关。读取仅接受已知 ID、有界去重数组和布尔值，限制输入长度为 50,000 字符；损坏或不兼容数据安全回落。存储失败只影响持久化，不阻断浏览。增加持久化字段时同步类型、读取白名单和兼容测试。

## 图片与运行资源

新档案图片在 `public/assets/catalogue/`：122 个 PNG，覆盖所有 64 份新资料。`catalogue-assets.json` 记录来源、权利、核验日期、尺寸、字节数与 SHA-256，公开副本为 `sources.json`。原地图图片继续使用独立的 `game-assets.json` 和 `public/assets/game/`，共 37 个 PNG。

使用 `catalogueAssetFor(id, kind)`／`catalogueAssetUrl(asset)` 读取新图片；`assetFor`／`assetUrl` 读取地图徽记和景观。完整干员图分为 `portrait` 与 `elite`，头像为 `thumbnail`；敌人使用 `enemy`，其中十种另有 `thumbnail`；物资使用 `item`。六种敌人仅提供 158px 源站头像，不能把低分辨率本身当作下载失败。

图片加载失败时 `EntryArtwork` 显示条目名称与中性标记，`Emblem` 也有占位，不应阻塞正文。城市只在明确标注归属时继承地区景观，不冒用该国徽记或把地区图称作城市实景。

```sh
node scripts/import-catalogue-assets.mjs
node scripts/import-catalogue-assets.mjs --verify
```

导入器按精选清单调用 PRTS `imageinfo` 获取真实 URL，使用本地校验和跳过完好文件；`--only=ID,ID` 限定范围，`--refresh` 重新核验并下载，`--verify` 完全离线。详细图片说明见 [CATALOGUE_SOURCES.md](CATALOGUE_SOURCES.md)。原地图图片继续由 `scripts/import-game-assets.mjs` 维护。

Three.js 地图按场景懒加载，900px 以下使用 SVG。三维地图以实例化网格绘制地形，采用 demand 帧循环及受限 DPR；手动操作接管运镜。字体从本地 Fontsource 包打包，中文使用系统字体；提示音只在启用后由 Web Audio 合成。正常浏览不会请求远端数据、字体或图片。

## 检查边界

先执行 `npm run validate` 和素材离线校验，再以实际浏览器检查键盘、触屏、检索关联、地图返回、图片失败及减少动态效果。命令入口异常时使用 [README 的 Node 直调方式](../README.md)。实际执行结果单独记录在 [VERIFICATION.md](VERIFICATION.md)，不能以构建成功代替视觉验收。

本项目没有账号、评论、CMS、全量同步或养成计算器。数据是精选快照；新增功能应继续保留来源、访问性、静态部署与旧链接兼容。
