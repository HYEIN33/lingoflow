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
    version: '0.3.0',
    date: '2026-04-20',
    title: '课堂同传（内测）',
    changes: [
      '新增「课堂同传」Tab：上课听不懂时点开始，屏幕上实时出中文字幕',
      '支持 Zoom / Teams 窗口音频 和 麦克风两种来源',
      '听不懂某一段？按红色「听不懂」按钮 → 15 秒回放 + 深度解释',
      '下课自动保存这节课的笔记到云端',
    ],
    isMajor: true,
  },
  {
    version: '0.2.1',
    date: '2026-04-20',
    title: '更顺手的 memeflow',
    changes: [
      'Tab 拖拽现在所有人都能用了，你拖到最前面的 Tab 就是默认打开页',
      '一些细节改动，提升整体使用体验',
    ],
    isMajor: false,
  },
  {
    version: '0.2.0',
    date: '2026-04-20',
    title: '翻译快到飞起',
    changes: [
      '按下翻译，半秒就看到中文开始冒出来，告别白屏等待',
      '单词详情（近义词/反义词/时态变化）改成按需加载，翻译本身更快',
      '整体速度提升 5 倍，同一句话以前 5 秒，现在 1 秒',
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
