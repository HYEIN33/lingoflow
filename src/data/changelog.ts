// User-facing changelog. Newest first.
//
// Rules for writing entries:
//   - 用大白话。用户不关心 "refactored X service" 或 "SSE + thinkingBudget"
//     —— 他们关心 "翻译快了" / "生词本能分文件夹了" / "Pro 多了一个小功能"。
//   - 每条 change 一行一件事。不超过 3 条 (除非真的是大更新)。
//   - 从用户视角写："翻译更快"不是"优化翻译管线"。
//   - 标题 (title) 一句话说本次最想让用户知道的 headline。
//   - 不要把运营/成本/基础设施的话写给用户看。用户没有"API 配额"、
//     "token 预算"、"Firestore 读写"这些概念。"按需加载、翻译更快" ✓,
//     "不浪费配额" ✗ (配额是你的不是用户的)。反例：2026-04-20 我第一版
//     写了"不浪费你的配额"，用户没有配额。
//
// Bump `version` AND add a new entry here every time you ship something
// user-visible. Don't bump for pure infra/refactor changes — the bell only
// lights up when the user would actually notice a difference.

export interface ChangelogEntry {
  version: string;       // e.g. "0.2.0" — must match package.json so the bell
                         // compares apples to apples. See compareVersions().
  date: string;          // ISO "YYYY-MM-DD"
  title: string;         // one sentence, user-facing headline
  changes: string[];     // bullet points, plain language
  isMajor?: boolean;     // true → pop a toast on first open after upgrade.
                         // false → only light up the bell (quiet rollout).
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.4.1',
    date: '2026-05-02',
    title: '用量看板独立成页 · 顶部一键查看',
    changes: [
      '【新功能】右上角新增一个仪表盘图标，点开就是"今日用量"页 — 5 个常用功能（翻译、课堂同传、语法、梗百科、AI 问答）一眼看完，今天还能用多少次直接显示成大白话',
      '【新功能】顶部仪表盘图标会随用量变色 — 默认灰色，用到 70% 变黄，到 90% 变红还会轻微闪烁，瞄一眼就知道有没有撞限风险',
      '【交互】每个 tab 标题旁的小用量徽章去掉了 — 现在用量只在顶部仪表盘那里看，tab 栏更干净',
      '【交互】PRO 徽章移到 MemeFlow 标题旁边，铃铛跟在后面 — 让"标题/PRO/通知"看起来是一组',
      '【修复】课堂同传的 AI 笔记不再生成失败了 — 之前给 Gemini 传了一个不存在的参数值，被直接拒收，导致每次点笔记都报红字 502；改成合法值之后秒出',
      '【修复】控制台不再刷一堆红字 fallback 警告 — 同上一条根因，顺手治了',
    ],
    isMajor: true,
  },
  {
    version: '0.4.0',
    date: '2026-05-02',
    title: '课堂同传不再漏字了',
    changes: [
      '【课堂同传】给课堂同传换了一条更稳的线路 — 以前你的电脑直接连国外的语音识别服务，家里 wifi 抖一下就漏一段话；现在中间多了一台云端中转，断网/网络抖动那 1-3 秒的音频会被缓存住、网络恢复后自动补送上去，理论上"漏话"应该几乎不会再发生了',
      '【课堂同传】和上一条相关 — 重新连接时屏幕不再显示"翻译中卡住"或者中英文不同步的诡异状态，所有重连过程在后台静默完成',
      '【隐形升级】课堂同传的语音识别 API key 不再发到你浏览器里，更安全',
    ],
    isMajor: true,
  },
  {
    version: '0.3.4',
    date: '2026-05-02',
    title: '看得见用量 + 翻译更准 + 课堂切 tab 不丢状态',
    changes: [
      '【新功能】每个 tab 标题旁边出现一个小绿点 + 数字（比如 12/500），告诉你今天还能用多少；快用完时变红还会冒出"升级 Pro"按钮',
      '【翻译】课堂同传翻译终于忠实了 — 老师说"I think dancing"会翻成"我觉得跳舞"，不再被 AI 改写成"她说她觉得跳舞"那种第三人称转述',
      '【翻译】翻译卡换了字体 — 中文换成思源黑体（更清晰），英文 13px → 14px（更好看）',
      '【课堂同传】字幕显示切换砍掉了，永远中英对照（之前的"只看中文"按钮容易点错，反正学英语本来就要看原文）',
      '【课堂同传】切到别的 tab 再切回来不会显示"未开始"了 — 之前会以为程序卡了，其实底下一直在跑',
      '【翻译】"清空 ✕"按钮不再跟翻译键挤在一起 — 移到了右边按钮组的最左边',
      '【翻译】滚回去看翻译结果时一直显示"跳到最新"按钮，不用滚到底了才出现',
      '【语法检查】不再把大小写和标点当成错误了 — 只挑真正的语法问题（时态错、用词错、结构错）',
      '【课堂笔记】AI 笔记不再 502 失败了 — 关掉了那个让笔记很慢的"深度思考"，10 秒内就能出结果',
      '【个人中心】管理员能看到一张"今日用量"看板（6 个功能各一张卡，有进度条和颜色提示）',
      '【隐形修复】梗百科提交失败时会告诉你具体哪条规则没过，不再只是"提交失败请重试"；修了几个让连接被防火墙拦的安全策略问题',
    ],
    isMajor: true,
  },
  {
    version: '0.3.3',
    date: '2026-04-30',
    title: '课堂同传修了一堆烦人的小毛病',
    changes: [
      '【课堂同传】卡片不再永远卡在"翻译中"了 — 万一卡住，30 秒后会自动变红色"翻译失败"按钮，可以一键重试',
      '【课堂同传】说一两句短的然后停下，等一会儿（约 8 秒）也会自动出翻译，不会让你的最后一段干等',
      '【课堂同传】按暂停的瞬间会立刻把刚说的那段翻译完，不留尾巴；继续之后新说的话会出现在新卡片，不再覆盖暂停前的内容',
      '【课堂同传】修了一个让连接反复断开重连的 bug — 之前会出现 console 里疯狂刷红的"线路卡住？"提示，现在恢复正常',
    ],
    isMajor: false,
  },
  {
    version: '0.3.2',
    date: '2026-04-27',
    title: '课堂同传更稳了 + 弹窗配色统一',
    changes: [
      '【课堂同传】字幕不再"一句一卡片"碎成马赛克 — 现在一段一段流畅出来，等翻译时也只占一张卡',
      '【课堂同传】翻译变快了 — 多段同时翻译不用排队（Pro 5 段并发，免费 2 段）',
      '【课堂同传】翻译失败可以一键重试，不用刷页面',
      '【课堂同传】滚回去看历史时新内容来了会浮"↓ N 条新内容"按钮，不会被自动拽到底',
      '【弹窗】更新提示、退出确认、操作成功失败的小弹窗全部换成跟主页一致的玻璃风',
    ],
    isMajor: true,
  },
  {
    version: '0.3.1',
    date: '2026-04-22',
    title: '复习能"再练一次" + 全站视觉统一 + 隐形 bug 修复',
    changes: [
      '【复习】加了"再练一次 / 全部重练"：学过的词想提前刷一遍不用等几天。"完全忘了"按钮终于真的管用 —— 这个词会 10 分钟后再考你一次，答不上就继续出',
      '【提醒】顶部加了更新日志小铃铛：有更新会亮红点，点开看得到改了啥',
      '【单词本】顶上 4 个指标做成仪表盘条 + 悬停能看定义；桌面多了左侧文件夹栏；文件夹 / 风格筛选补全；复习状态文案清爽了',
      '【翻译 / 语法】正式度滑块拖完自动重翻；结果自动滚到视野里、不再白屏干等；语法通过时会讲为什么写得好；有错时修改的词蓝色高亮',
      '【课堂同传】开始录音后配置自动收起成一行，专心看字幕；字幕 / 问 AI / 实时笔记焊成一体；笔记加 BETA 标 + 45 秒自动更新说明',
      '【课堂笔记】导出 PDF 改成真下载；列表补"本周新增 N 节"+ 时长 / 文件夹；详情加"AI 笔记 · 老师讲的核心"摘要；删除改成居中大弹窗（红色警告）',
      '【梗百科】每个词最高票解释用毛玻璃卡突出；每条补社区热度（赞 / 评论）；搜索下拉显示释义条数；热搜带 🔥 字号变大',
      '【排行榜】卡片整体压窄一圈，"积分规则"收成可点开；补回"倒计时 + 周日 23:59 结算"',
      '【统一视觉】登录 / 付费 / 维护 / 个人中心全部换成统一毛玻璃（以前纯白硬卡）；Logo 三处统一成蓝渐变 + Languages 图标；Google 按钮加彩色 G 字标；Pro 徽章用斜体蓝强调；个人中心徽章字变大 + 订阅卡显示具体续费日期',
      '【Tab 栏】改成完整胶囊 + 图标文字同排 + 当前 tab 蓝点移到文字前',
      '【隐形修复】品牌字终于能加载了（以前被浏览器安全策略拦下载，看起来像系统字）；贡献数 / 声誉分以前提交后没真存进后台，现在真能涨；堵了作弊漏洞 —— 敏感数字只有服务器能改',
      '【后台】管理员补了批量导入 / 全量备份 / 数据扫描 + 修复 / 作者历史 / 封禁解封 / AI 重新打分；每次提交自动跑 321 个测试 + 11 个浏览器流程，不再靠手测',
    ],
    isMajor: true,
  },
  {
    version: '0.2.21',
    date: '2026-04-22',
    title: '课堂笔记真 · PDF 导出 + 产品数据体检',
    changes: [
      '课堂笔记「导出 PDF」改成真的 PDF：标题 + 概述 + 重点三段，直接下载 .pdf 文件（不再让你自己去打印对话框选"另存为 PDF"）',
      '管理员后台「查看被举报的 meaning」按钮改对了：现在会正确跳到梗百科并搜索这个词（之前点击是死链）',
      '做了一次产品数据体检：梗百科已有 933 条词条 + 851 条释义，数据量足够；课堂同传真实用过 3 次',
    ],
    isMajor: false,
  },
  {
    version: '0.2.20',
    date: '2026-04-22',
    title: '管理员后台收尾：解封 / 分片导入 / 分页导出 / 封禁闸门',
    changes: [
      '管理员可解除封禁：在作者历史弹窗里一键 Unban（状态恢复但历史拒绝不回滚）',
      'Import 不再限 50 条：前端自动分片（50/片）上传 + 进度条显示',
      'Export 不再限 5000 条：服务端分页 2000/页，前端 while 循环拉完所有 meanings 再打包下载 + 进度条',
      '被封用户创建梗条和评论被 Firestore rules 直接拦掉（不是只靠前端检查）',
      '管理员所有 Sentry 事件自动带 adminUid + adminEmail context，方便事后追查',
      'E2E 扩充到 11 个流程：加"管理员面板结构"（DEV-only bypass，生产 tree-shake 移除）',
      'scripts/set-admin-claim.mjs 一次性授权 admin custom claim（用 Admin SDK，而不是手改 Firestore）',
    ],
    isMajor: true,
  },
  {
    version: '0.2.19',
    date: '2026-04-22',
    title: '管理员后台全功能打通 + E2E 自动化覆盖到位',
    changes: [
      '管理员后台 Import：粘贴 JSON 一键批量导入梗词条（最多 50 条一批）',
      '管理员后台 Export：一键下载全量 slangs + meanings JSON 备份',
      '管理员后台 Repair：扫 4 类数据问题（孤儿 meaning / 重复 term / 缺作者 / 缺 AI 评分）+ 一键修复',
      '管理员后台 Browse：分页 50 条/页 + 状态筛选（全部/已通过/待审/已拒绝）+ 客户端搜索',
      '待审卡加 mini 操作按钮：AI 重新评分（调 Gemini 打分）/ 作者历史 modal / 封禁作者（含二次确认 dialog）',
      '封禁作者自动把该作者所有 pending 批量拒掉',
      'Cloud Functions 新增 7 个：bulkImportSlangs · exportAllData · scanDataIssues · repairDataIssues · rescoreMeaning · banAuthor（全走 admin SDK + 审计日志）',
      '提供 Node 脚本 set-admin-claim.mjs 用 Admin SDK 给用户设 admin custom claim（而非直接改 Firestore role）',
      'E2E 覆盖升到 10 个流程：加"管理员 gate"安全测试（非 admin 进 ?admin URL 应落回主应用）',
    ],
    isMajor: true,
  },
  {
    version: '0.2.18',
    date: '2026-04-22',
    title: '登录页重做 + 管理员后台上线 + 实时笔记可保存',
    changes: [
      '登录页改成左右分栏：左侧大字 hero（带价值主张 + 功能 chip + 3 条 feature）+ 右侧登录卡；mobile/tablet 只显示登录卡',
      '排行榜的"AI 质量 XX"换成了真实身份（梗百科编辑 / 多模态先锋 / 梗学徒 等），从你装备的成就派生',
      '课堂同传的"实时笔记"面板重做：白底卡 + "AUTO 每 45 秒刷新" 蓝色 pill + "updated Xs ago" 时间戳',
      '实时笔记可以"保存到笔记"存到云端 · "导出 PDF"（打开打印对话框另存）',
      '上线管理员后台（?admin URL 参数触发）：待审核 + 举报 + 批量通过/拒绝',
      '审核动作走 Cloud Function 保证原子性：改状态 + 加作者声望 + 写审计日志三件事一起，不会中途失败',
      'E2E 自动化测试：9 个关键用户流程覆盖（登录/翻译/语法/梗百科/课堂/个人/复习/拍照/设置）',
    ],
    isMajor: true,
  },
  {
    version: '0.2.17',
    date: '2026-04-22',
    title: '全站对原型查漏补缺 · 多个功能区补齐',
    changes: [
      '语法检查通过时会完整讲解：原句高亮 + 为什么写得好 + 更地道的写法（以前只显示空白）',
      '语法检查有错时，修改过的词在对比句里用蓝色高亮，一眼能看出改了哪',
      '复习页卡面加了例句作为记忆锚点；复习完成后会显示"明天还有 N 个到期"+ 去翻译/看热门两个入口',
      '复习页卡顶加难度等级标识（SM-2 LVL N）',
      '单词本顶部 4 项统计：收藏 · 今天待复习 · 已掌握 % · 本周新增',
      '单词卡右下角显示复习节奏（今天复习 / N 天后复习 / 已掌握）',
      '单词详情新增反义词（红 chip）和词形变化（紫 chip）两个区块',
      '梗百科顶部加 eyebrow · 补充解释区 AI 评分按分数显示绿/琥珀/红',
      '梗百科举报选项补全到 5 项（+ 重复词条 / 恶意刷赞）',
      '准则页差的示例下方多了 AI 反馈解释，说明为什么被打低分',
      '贡献 wizard 种子词改回英文 slang（yolo / rizz / skibidi / gyatt…）+ 增加"上一步"按钮',
      '课堂同传 live-bar 显示已录时长（mm:ss）+ 右上角加"笔记"浮动入口',
      '课堂笔记详情加 3 按钮（导出 PDF / 分享 / 删除）+ 英文/中文行分色显示',
      '付费页支付图标从 emoji 换成线条 SVG · 登录页底部加用户协议/隐私条款声明',
    ],
    isMajor: true,
  },
  {
    version: '0.2.16',
    date: '2026-04-22',
    title: '个人页全面升级 + 拍照翻译可从相册选图',
    changes: [
      '拍照翻译新增「从相册选取」：点相机图标弹出小菜单，可拍照也可从手机相册挑图',
      '个人页重做：92px 头像 + 身份副标题（显示已装备的成就）+ 4 项概览（贡献 / 天连续 / 声望 / 徽章）',
      '个人页新增订阅状态卡：Free 态给「立即升级 Pro」，Pro 态显示续费信息 + 管理 / 取消按钮',
      '个人页新增数据导出卡：一键下载 JSON（符合 GDPR 可移植性）',
      '个人页新增新手任务弹层：5 项 checklist（搜索 / 翻译 / 保存 / 贡献 / 复习）带进度条',
      '换头像新增圆形裁剪界面：拖动 + 缩放 + 确认上传，不再直接用系统选图',
      '顶部 logo 方块回来了：蓝渐变圆角方 + 闪光图标',
      '右上角头像按钮改成真头像胶囊（有上传的显示照片，没上传显示首字母）',
      '启动画面重做：品牌 logo + 脉冲动画 + 三个蓝点 loader',
      '报错页重做：错误详情折叠框 + 刷新 + 重试双按钮 + 联系邮箱',
      '新增离线条：断网时顶部自动显示黄色提示，连上网自动消失',
    ],
    isMajor: true,
  },
  {
    version: '0.2.15',
    date: '2026-04-21',
    title: '全站设计换血 + 课堂同传不再吞英文',
    changes: [
      '整站换新视觉：白蓝渐变背景 + 液态玻璃卡片，品牌字换成 Clash Display，中文用思源宋体',
      'Tab 栏改成玻璃胶囊，当前页底部有一颗发光蓝点做小标识',
      '翻译页输入框和正式程度滑条合并进一张玻璃大卡，搜索记录降级为半透明小胶囊',
      '课堂同传修复吞英文：订阅 Deepgram 的 UtteranceEnd 事件，用它来 commit 那些 final 为空但 interim 有字的句子',
      '课堂同传新增 auto-recovery：当识别引擎发送一连串空 final 但麦克风仍有声音时，自动重连 WebSocket',
      '课堂同传右上角加「线路卡住？重连」按钮 — 用户也能手动救回',
      '顶部品牌 logo 小方块去掉，Pro 徽章改纯黑胶囊',
    ],
    isMajor: true,
  },
  {
    version: '0.2.13',
    date: '2026-04-20',
    title: '课堂同传：往上翻历史不再被新字幕拽回底部',
    changes: [
      '在底部时新字幕出来会照常自动滚；往上滑查看前面讲过的内容时，新字幕会加到下面但你的视图不动',
    ],
    isMajor: false,
  },
  {
    version: '0.2.12',
    date: '2026-04-20',
    title: '课堂同传：两种翻译模式各自用最合适的触发',
    changes: [
      '整段翻译：累积 180 字或停顿 4.5 秒就翻，最长兜底 18 秒；视频课句间停顿不会再让每句单独翻了',
      '实时翻译：每句话讲完立刻翻，不攒',
      '翻译中会显示「翻译中…」',
      '笔记不再生成词汇预习',
    ],
    isMajor: false,
  },
  {
    version: '0.2.3',
    date: '2026-04-20',
    title: '课堂同传：两种翻译模式 + 翻译中提示',
    changes: [
      '新增「整段翻译 / 实时翻译」两种模式：整段 = 几句攒成一段再翻，读起来顺；实时 = 每句立刻翻，延迟最低',
      '翻译过程中会显示「翻译中…」，不再让人怀疑是不是卡了',
      '整段翻译改成「按句子数触发」：累积 3 句完整话或 160 字就翻，不再死等停顿',
      '去掉笔记里的「词汇预习」，只留概述和重点',
    ],
    isMajor: false,
  },
  {
    version: '0.2.2',
    date: '2026-04-20',
    title: '课堂同传：真·整段翻译',
    changes: [
      '修了一个大 bug：之前课堂字幕还是「一句英文 + 一句中文」交替显示，不像整段翻译；现在几句英文攒成一段，中文以段落形式一次出现，读起来像文章不像字幕',
      '不再出现「一句英一句中」碎片感',
    ],
    isMajor: false,
  },
  {
    version: '0.2.1',
    date: '2026-04-20',
    title: '课堂同传：更稳、更准，能选课',
    changes: [
      '现在开课前可以选一门课（金融/计算机/法律/传媒/哲学...），AI 会按这门课的场景翻译专业术语',
      '字幕不再一句一句闪，改成几句一起翻译，更顺、更准，也不容易卡',
      '课堂里多了「暂停」按钮，中场休息时按一下，不用重新开始',
      '新增「我的笔记」入口，保存的课堂笔记可以翻、改名、分文件夹收纳',
      'Tab 条现在支持横向滑动，就算 Tab 多也能看到后面的；长按当前 Tab 才能拖动排序',
      '翻译偶尔失败时会自动重试，减少漏翻',
      '一些细节打磨',
    ],
    isMajor: true,
  },
  {
    version: '0.2.0',
    date: '2026-04-20',
    title: 'MemeFlow 大更新：更快、更顺、还能听课',
    changes: [
      '翻译速度提升 5 倍，按下翻译半秒就看到中文开始冒出来，再也不用白屏干等',
      '新增「课堂同传」Tab：上课听不懂时点开始，屏幕上实时出英文原文 + 中文翻译',
      '课堂模式支持网课（Zoom / Teams 标签页）和线下课（麦克风）两种场景',
      '课堂里听不懂直接在底部「问 AI」打字提问，它会根据老师刚才讲的内容回答你',
      '下课自动把这节课的笔记保存到云端',
      'Tab 可以拖拽排序，拖到最前面的 Tab 就是你的默认打开页',
      '右上角多了「设置」齿轮：语言切换、邮件反馈、加开发者微信、退出登录都挪进去了',
      '单词详情改成按需加载，翻译本身更快',
      '一些细节改动，整体使用更顺手',
    ],
    isMajor: true,
  },
];

// Naive semver-ish compare. Returns positive if a > b, 0 if equal, negative
// if a < b. We only use major.minor.patch — no prerelease, no metadata.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Returns entries strictly newer than `seenVersion`. Used to decide what
// to show in the "unseen" section of the bell / toast.
export function entriesNewerThan(seenVersion: string | null): ChangelogEntry[] {
  if (!seenVersion) return CHANGELOG; // first time opening: everything is new
  return CHANGELOG.filter((e) => compareVersions(e.version, seenVersion) > 0);
}

// The single newest entry, used by the toast. Returns null if changelog is
// somehow empty — defensive; shouldn't happen in prod.
export function latestEntry(): ChangelogEntry | null {
  return CHANGELOG[0] || null;
}
