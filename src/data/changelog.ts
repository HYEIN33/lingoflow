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
