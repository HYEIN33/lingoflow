# LingoFlow v2: 梗百科优先重设计

## 背景

LingoFlow 是一个基于 Gemini AI 的英语学习助手，运行在 Google AI Studio 上。目前功能包括：中英翻译（地道/学术双栏）、语法检查（风格检测）、TTS 语音、网络俚语词典（梗百科）、用户排行榜、Pro 订阅系统。

技术栈：React 19 + Vite + Tailwind CSS 4 + Firebase (Auth + Firestore + Storage) + Gemini API

## 问题

1. **颜色不统一** — 主界面蓝白渐变，但 SlangOnboarding（墨绿/teal-950）、UserProfile（深色 #0a0a0a）、Leaderboard（深色）、PaymentScreen（深色）各自为政
2. **用户无法修改用户名和头像** — UserProfile 完全使用 mock 数据，没有连接 Firebase
3. **成就系统粗糙** — 使用 SVG 硬编码的金属质感勋章，复杂但辨识度低
4. **梗百科不是首页** — 作为产品核心 USP，梗百科被排在翻译后面
5. **含义输入无 AI 辅助** — 用户写俚语含义时没有实时联想
6. **Google 登录在本地开发不可用** — Firebase OAuth 的 authorized domain 限制

## 计划

### 1. 统一蓝白色调设计系统

所有页面统一使用：
- 背景：`bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50`
- 卡片：`bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl`
- 主色：`blue-600`，辅助：`amber-500`（Pro/奖励），`emerald-500`（成功状态）
- 文本：`text-gray-900`（标题），`text-gray-500`（副文本）
- 按钮：`bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200`

移除所有 teal-、coral-、#0a0a0a、#0f1115 等深色主题残留。

影响范围：SlangOnboarding.tsx、UserProfile.tsx、Leaderboard.tsx、PaymentScreen.tsx

### 2. UserProfile 重写

- 连接 Firebase Auth 真实数据（displayName, photoURL, email）
- 可编辑用户名：点击编辑图标 → input → updateProfile()
- 可上传头像：hover 显示 Camera 图标 → 选文件 → uploadBytes 到 Firebase Storage → updateProfile({ photoURL })
- 从 Firestore 实时拉取用户词条贡献（slang_meanings where authorId == uid）
- 设置面板统一白色主题

### 3. 成就勋章重设计

6 个成就，基于用户真实数据自动计算：
| 成就 | 条件 | 图标 | 颜色 |
|------|------|------|------|
| 梗学徒 | >= 1 词条 | 📝 | blue |
| 文化观察员 | >= 5 词条 | 👁️ | indigo |
| 周打卡达人 | 连续 7 天 | 🔥 | orange |
| 多模态先锋 | 上传过媒体 | 🎬 | purple |
| 梗百科编辑 | >= 20 词条 | ✏️ | emerald |
| 梗神 | >= 100 词条 | ⚡ | amber |

用渐变色圆角方块 + emoji，锁定态灰色半透明 + grayscale。

### 4. 梗百科作为首页

- 默认 tab 改为 slang（梗百科）
- Tab 顺序：梗百科 → 翻译 → 语法 → 单词本 → 复习
- 新用户默认 tabOrder 也改为此顺序

### 5. AI 含义联想

用户在含义输入框打字时：
- 输入 >= 3 字后，800ms 防抖触发 Gemini 请求
- 调用 `suggestSlangMeaning(term, partialInput)` — Gemini 根据已输入内容补全/扩展为完整定义
- 输入框下方显示蓝色建议卡片（AI 建议），点击采纳替换输入
- 同时在 SlangOnboarding 和 SlangDictionary 两处实现

### 6. 本地开发登录

- Dev 模式下 Google 登录失败自动降级匿名登录
- `import.meta.env.DEV` 检查确保生产环境不会触发匿名登录
- URL 参数 `?qa` 支持 headless 浏览器直接匿名登录（QA 测试用）

### 7. 排行榜重设计

- 移除深色主题，统一蓝白
- 排名用渐变色圆形（金/银/铜）
- Tab 切换与主应用风格一致
- 支持中英双语

### 8. 支付页面重设计

- 统一蓝白风格
- Free 层包含：基础翻译、梗百科、成就勋章、小组排行榜、UI 自定义
- Pro 层：无限翻译、语气滑块、艾宾浩斯复习、优先响应、全球排行榜
- 支持中英双语

## 目标用户

中国大学生和年轻职场人，需要在中英文之间切换，同时对互联网文化/梗有浓厚兴趣。梗百科是差异化特性——不只是翻译工具，更是文化社区。

## 非目标

- 不做社交聊天功能
- 不做视频课程
- 不做多语种（只做中英）
- 不做原生 app（保持 PWA / Web）

## 风险

1. Gemini API 成本 — AI 含义联想会增加 API 调用，需要监控
2. 匿名登录滥用 — 仅限 dev 模式，生产环境不触发
3. Firebase Storage 头像存储成本 — 限制 2MB/文件
4. 内容审核 — 梗百科 UGC 依赖 AI 审核，可能误判
