z r# MemeFlow — Stitch Prompt (Apple Liquid Glass)

粘贴到 https://stitch.withgoogle.com/ 生成原型。  
**只有 prompt，没有代码。**

---

## 全局设计语言（每个 prompt 前先粘这段）

```
GLOBAL STYLE — apply to every screen:

Apple iOS 26 "Liquid Glass" design language. Target: young Chinese users who care about aesthetics.

BACKGROUND: Pure off-white #FAFAFA base. Three large, slow-drifting color blobs behind all content:
  - Top-left: lavender #E9D5FF at 20% opacity, ~200px, blur 80px
  - Center-right: mint #A7F3D0 at 15% opacity, ~180px, blur 80px
  - Bottom-center: peach #FECDD3 at 12% opacity, ~160px, blur 80px

GLASS MATERIAL (4 tiers):
  - Glass Light: rgba(255,255,255,0.55), blur 20px, saturate 1.8, border 1px solid rgba(255,255,255,0.7)
  - Glass Medium: rgba(255,255,255,0.65), blur 24px, saturate 1.8, border 1px solid rgba(255,255,255,0.7)
  - Glass Heavy: rgba(255,255,255,0.75), blur 32px, saturate 2.0, border 1px solid rgba(255,255,255,0.8)
  - Glass Recessed: rgba(245,245,247,0.5), blur 16px, border 1px solid rgba(0,0,0,0.03) — for secondary/quoted content

ACCENT: One single gradient — violet #8B5CF6 to rose #EC4899. Used ONLY for:
  - Primary CTA buttons (filled gradient, white text)
  - Active tab indicator (tiny 2px dot)
  - Gradient text on key labels
  - Logo icon background
  Everything else is grayscale.

TYPOGRAPHY:
  - Titles: weight 800, #1D1D1F (almost-black), letter-spacing -0.02em
  - Body: weight 400, #86868B (Apple secondary gray)
  - Placeholder/tertiary: #C7C7CC
  - Micro labels: weight 700, 10px, uppercase, tracking 0.2em, #86868B
  - Numbers/stats: tabular monospace

SPACING: Extremely generous. 32px card padding on mobile. 24px section gaps. Each viewport shows 2-3 elements maximum.

CORNERS: 24px for glass cards, 16px for buttons, 999px for pills.

SHADOWS: Ultra-subtle. Cards: 0 2px 16px rgba(0,0,0,0.04). Accent CTA: 0 4px 16px rgba(139,92,246,0.25).

ICONS: Thin line-style (1.5px stroke), never filled. SF Symbols aesthetic.

MOTION CONCEPT: Elements appear with opacity 0→1, scale 0.97→1, duration 500ms, cubic-bezier(0.22, 1, 0.36, 1). No bounce. No y-offset slide-in.

OVERALL FEEL: An iOS Settings page that became a premium language learning app. Confident in whitespace. The glass material and one gradient accent do all the visual work. Nothing screams for attention — everything whispers.
```

---

## 1. 翻译页 — Translation (Main Screen)

```
Mobile screen (375x812, iPhone 15 Pro) for a language learning app called MemeFlow.

[Apply GLOBAL STYLE above]

STATUS BAR: Standard iOS, light mode.

HEADER BAR (Glass Heavy): Floating below status bar. Left: a 32px rounded-square logo icon filled with violet-to-rose gradient, white thin-line translate symbol inside. "MemeFlow" in weight-700, #1D1D1F. Right: three icon buttons (trophy, user circle, globe) in #86868B, 20px, thin-line style. The header bar uses Glass Heavy material.

TAB SELECTOR (Glass Light): Horizontal pill container below header. Five text-only tabs: "翻译", "梗百科", "语法检查", "单词本", "复习". Active "翻译": text #1D1D1F, tiny 2px gradient dot (violet-to-rose) centered below the text. Inactive: #86868B. No background fills, no icons in tabs. Clean horizontal text row.

MAIN INPUT (Glass Medium card, 28px radius): Large card taking ~25% of viewport. Placeholder "输入中文或英文..." in #C7C7CC. Bottom-right inside the card: three icons in a row — camera (thin-line, #C7C7CC), mic (thin-line, #86868B), and a 36px circular CTA button (violet-to-rose gradient fill, white arrow icon, gradient-matched shadow at 25% opacity). The CTA is the ONLY colored element in the input area.

SCENE SELECTOR: Below input. Micro-label "场景" in 10px uppercase #86868B. Three pill chips: "聊天" (active — gradient text violet-to-rose, thin gradient border at 30% opacity), "商务" and "写作" (text #86868B, thin #E5E5EA border). Pill shape, generous horizontal padding.

SEARCH HISTORY (Glass Recessed card): "搜索记录" in 10px #C7C7CC, "清空" link on right in #86868B. History items as horizontal text chips: "今天天气不错", "我在弄咖啡", "你好" — each in #86868B on thin glass pills with #E5E5EA borders. Compact, one row, horizontally scrollable.

ATMOSPHERE: The page is 60% empty space. The glass input card is the visual anchor. The gradient CTA button is the only spot of color. It looks like Apple designed a translator.
```

## 2. 翻译结果页 — Translation Result

```
Same MemeFlow app. Same Apple Liquid Glass global style. Now showing a translation result for "今天天气不错".

INPUT AREA: Same glass card but now showing "今天天气不错" as typed text in #1D1D1F.

RESULT COMPOSITION: Below input, a layered glass card system creating depth:

OUTER CONTAINER (Glass Medium, 28px radius): Contains everything. Subtle shadow.

INNER CARD — AUTHENTIC (Glass Medium, slightly more opaque, 20px radius): 
  - Top-left: small avatar circle (24px, gradient border violet-to-rose). Next to it: "MemeFlow AI" in 12px #86868B.
  - Badge: "⚡ 地道" in gradient text (violet-to-rose), 10px uppercase.
  - Translation: "The weather's great today!" in 20px weight-600 #1D1D1F. This is the hero text.
  - Divider: ultra-thin line in #F5F5F7.
  - Action row: heart icon (thin-line, #C7C7CC), "收藏" in 12px #86868B | waveform/speaker icon, "朗读" | share icon, "分享". All thin-line 18px icons in #C7C7CC. Generous spacing between actions. When heart is tapped, it fills with gradient.

REACTION ROW (below inner card, still inside outer container):
  "觉得如何？" in 12px #C7C7CC. Two reaction pills: "❤️ 赞" and "👎 改进" — each is a Glass Recessed pill with thin border. Tapped state: subtle tint fill.

ORIGINAL TEXT (Glass Recessed, most transparent layer):
  "原文" micro-label in #C7C7CC. "今天天气不错" in #86868B. This layer is visually the farthest — most transparent, least present. Creates depth through glass opacity hierarchy.

KEY DESIGN PRINCIPLE: Three glass layers at different opacities create spatial depth. Translation (closest, most opaque) → Reactions (middle) → Original (farthest, most transparent). Hierarchy through material, not color.
```

## 3. 梗百科首页 — Slang Dictionary Home

```
Mobile screen (375x812) for MemeFlow slang dictionary.

[Apply GLOBAL STYLE]

Tab: "梗百科" active (gradient dot below).

DAILY CHALLENGE (Glass Medium card, subtle warm tint — add 3% peach to the white):
  Single row: thin-line lightning icon in gradient, "每日挑战" in weight-600 #1D1D1F, chevron-right #C7C7CC on far right. One line only. Minimal.

SEARCH (Glass Medium card, 28px radius):
  Thin-line magnifying glass #C7C7CC. Placeholder "搜索网络热词..." in #C7C7CC. Right: small pill button "搜索" with gradient fill and white text — the only color on this half of the screen.

TRENDING (Glass Medium card):
  "本周热门" micro-label in 10px uppercase #86868B. 
  List of trending terms — clean text rows inside the card, NOT individual cards:
  - #1: rank in gradient text, "plot twist" in weight-600 #1D1D1F, "24次" in monospace #86868B right-aligned
  - #2: rank in gradient text, "典" ...
  - #3: rank in gradient text, "六女一" ...
  - #4+: rank in #C7C7CC, term in #1D1D1F, count in #86868B
  Thin #F5F5F7 dividers between rows. No cards-within-cards. Apple list aesthetic.

BROWSE (horizontal scroll):
  "浏览" micro-label. Horizontal row of Glass Recessed pills: "plot twist", "白月光", "yyds", "glazing" — each in #86868B, thin border. Tappable.

FEEL: Content discovery feed with zero visual noise. Like browsing Apple News categories.
```

## 4. 梗百科词条详情 — Slang Entry Detail

```
Mobile screen (375x812) for slang entry "plot twist".

[Apply GLOBAL STYLE]

HEADER (no card — text on background):
  "plot twist" in 34px weight-800 #1D1D1F.
  Below: "1 条释义" in 12px monospace #86868B.
  Right side: "造句试试" and "+ 补充" as ghost pills (#86868B text, thin #E5E5EA borders).

DEFINITION CARD (Glass Medium, 28px radius):
  Author row: 24px avatar circle (gradient border), "LingoFlow Bot" in 12px #86868B, "AI 85" in gradient text inside a small Glass Recessed pill on the right.
  
  Definition text: 18px weight-500 #1D1D1F, line-height 1.75. "影视文化的梗，指意想不到的转折，用来描述生活里的意外，比如本来以为考砸了结果过了。" The text IS the hero. Generous padding around it.
  
  Example (Glass Recessed block nested inside the card): 2px gradient left accent line. "Plot twist: I actually passed the exam." in italic #86868B, 14px.
  
  Action bar: thin #F5F5F7 divider, then: heart icon (thin-line #C7C7CC, "0"), comment icon (#C7C7CC, "0"), share icon, speaker icon. All 18px thin-line. Generous gaps. Heart fills gradient on tap.

COMMENTS AREA: Below card. "评论" micro-label. Simple text input: Glass Recessed, placeholder "写评论..." in #C7C7CC. Apple Messages simplicity.

FEEL: A Wikipedia article redesigned by Jony Ive. Content-first. The glass card frames the definition without competing with it.
```

## 5. 语法检查 — Grammar Check

```
Mobile screen (375x812) for MemeFlow grammar checker.

[Apply GLOBAL STYLE]

Tab: "语法检查" active.

INPUT (Glass Medium card, 28px radius, TALL — 40% of viewport):
  Placeholder "输入句子以检查语法..." in #C7C7CC. The card is intentionally oversized to invite input.
  Bottom-right: thin-line mic icon (#86868B) and gradient CTA circle (arrow).
  When text is entered: a small X clear button appears at top-right in #C7C7CC.

EXAMPLES (when empty, below input):
  "试试这些" in 12px #C7C7CC.
  Three Glass Recessed pills in a row: "I have went to the store yesterday", "She don't like coffee", "Me and him is friends" — text #86868B, thin borders. Tappable, subtle hover glow.

RESULT (when showing):
  Input shrinks. Below: Glass Medium result card.
  Error display: wrong words have a subtle red-tinted Glass Recessed highlight (#FEE2E2 at 40% behind the text). Corrections in green-tinted glass (#D1FAE5 at 40%).
  Score: "85" in 48px gradient text (violet-to-rose) with a thin circular progress ring (gradient stroke on #F5F5F7 track).
  Below: individual corrections as clean rows — original → corrected, with thin dividers.

FEEL: A code linter that went to design school. Precision without coldness.
```

## 6. 单词本 — Wordbook

```
Mobile screen (375x812) for MemeFlow vocabulary book.

[Apply GLOBAL STYLE]

Tab: "单词本" active.

HEADER: "单词本" in 28px weight-800 #1D1D1F. Search: Glass Medium input with thin-line search icon.

FILTERS: text pills in a row. "全部" (active — gradient text, gradient dot below), "地道", "学术", "标准" in #86868B. No background fills.

WORD LIST (ONE Glass Medium card containing all words — not individual cards):
  Each word is a row inside the unified panel:
  - Left: 3px rounded accent line. Gradient (violet-to-rose) for 地道, soft purple #A78BFA for 学术, #E5E5EA for 标准.
  - Word: "我在弄咖啡" in weight-600 #1D1D1F
  - Translation: "I'm making coffee." in #86868B below
  - Right: thin chevron-right #C7C7CC
  - Divider: #F5F5F7 between rows

This is the iOS Settings pattern — one glass surface, structured list inside. NOT floating individual cards. The accent lines on the left provide the only color variation.

EMPTY STATE (if no words):
  Centered: thin-line book icon 48px in #D1D1D6. "还没有保存单词" in #86868B. "去翻译页面保存" in gradient text as a link.

FEEL: A well-organized library catalogue. Each word is a collectible, but the collection is presented with restraint.
```

## 7. 复习/闪卡 — Review Flashcards

```
Mobile screen (375x812) for MemeFlow spaced repetition review.

[Apply GLOBAL STYLE]

Tab: "复习" active.

PROGRESS: A thin 2px gradient line (violet-to-rose) at the top showing progress. "3/10" in tiny monospace #86868B right-aligned. NO thick progress bar. Just a thin line.

FLASHCARD (Glass Medium, 28px radius, takes ~50% viewport, centered):

FRONT STATE:
  - "3 / 10" in 10px #C7C7CC centered at top
  - Large gap
  - "ephemeral" in 36px weight-800 #1D1D1F centered
  - "/ɪˈfemərəl/" in 14px monospace #86868B below
  - Thin-line speaker icon centered, #C7C7CC
  - Large gap
  - "查看答案" as TEXT ONLY (not a button) — gradient text (violet-to-rose), weight-600, 16px. A thin horizontal line extends from it left and right, like a pull-to-reveal hint. Tapping this text flips the card.

BACK STATE (show simultaneously as if card is flipped with 3D perspective):
  - Word in 20px weight-600 #1D1D1F at top
  - Chinese meaning in weight-600 #86868B
  - English definition below in #86868B
  - Example in Glass Recessed with gradient left accent
  
RATING — 4 emoji reaction circles in a row below the card:
  Four Glass Medium circles (60px diameter each), evenly spaced:
  😫  🤔  😊  🤩
  Below each circle: label in 10px #C7C7CC ("忘记" / "模糊" / "记得" / "秒杀")
  Below label: interval in 9px #D1D1D6 ("1天" / "~3天" / "~1周" / "~2周")
  
  Tapped state: the selected circle gets a thin gradient border, emoji scales up 1.1x. Apple-smooth.

FEEL: Meditation app meets flashcards. Calm, focused, no gamification pressure. The generous whitespace and glass material make reviewing feel like a luxury, not a chore.
```

## 8. 登录页 — Login

```
Mobile screen (375x812) for MemeFlow login.

[Apply GLOBAL STYLE]

The color blobs are more visible here (slightly higher opacity) — the first impression should feel alive.

CENTER COMPOSITION (vertically centered in viewport):
  1. Logo: 64px rounded-square, gradient fill (violet-to-rose), thin white translate icon inside. Subtle gradient-matched shadow.
  2. GAP 16px
  3. "MemeFlow" in 32px weight-800 #1D1D1F
  4. GAP 8px
  5. "中文打字，地道英文秒出" in 16px #86868B
  6. GAP 32px

LOGIN CARD (Glass Medium, 28px radius, 32px padding):
  7. Primary CTA: full-width gradient button (violet-to-rose), "Google 登录" in weight-600 white, small Google "G" icon on left. 16px border-radius. Gradient shadow. This is the DOMINANT element.
  8. GAP 16px
  9. Divider: thin #F5F5F7 line with "或" in #C7C7CC centered
  10. GAP 16px
  11. "邮箱登录" — ghost button, thin #E5E5EA border, #86868B text, mail icon
  12. GAP 12px
  13. "内测邀请码" — text link only, #C7C7CC, no button chrome

FOOTER: "v0.1.1" in 10px monospace #D1D1D6. "Beta" in a tiny Glass Recessed pill next to it.

THE PAGE IS 70% WHITESPACE. The gradient CTA is the only vivid element on the entire screen. Everything else is glass and gray. This contrast makes the sign-in button irresistible.

FEEL: Apple Store product page. You trust this app before you've even used it.
```

## 9. 支付/升级页 — Payment

```
Mobile screen (375x812) for MemeFlow Pro upgrade.

[Apply GLOBAL STYLE]

HEADER: "升级 Pro" in 28px weight-800 #1D1D1F.
TOGGLE: Glass Light segmented control — "月付" | "年付 省40%". Active segment: gradient text. Inactive: #86868B. Thin glass separation.

TWO PLAN CARDS stacked vertically with 16px gap:

FREE CARD (Glass Light — most transparent tier, deliberately dim):
  "Free" in weight-600 #C7C7CC (yes, tertiary color — intentionally forgettable).
  "¥0" in 28px #86868B. "/月" in #C7C7CC.
  Feature list: thin-line check icons in #D1D1D6, text in #C7C7CC.
  The whole card FADES INTO THE BACKGROUND. It exists but doesn't compete.

PRO CARD (Glass Medium with thin gradient border at 35% opacity):
  "Pro" in gradient text (violet-to-rose), weight-700.
  Small "推荐" pill: gradient fill, white text, top-right corner.
  "¥xx" in 36px weight-800 #1D1D1F. "/月" in #86868B.
  Feature list: thin-line check icons in gradient, text in #1D1D1F.
  The card is MORE OPAQUE and has a GRADIENT BORDER GLOW — a whisper of color that says "choose me" without shouting.

CTA: Full-width gradient button "立即升级" below the cards. White text, gradient shadow. 
Below: "7天免费试用" in 12px #86868B.

HIERARCHY THROUGH MATERIAL: Free card uses the thinnest glass (almost invisible). Pro card uses thicker glass with a color whisper. The gradient CTA anchors the bottom. No animations needed — the material tells the story.
```

## 10. 排行榜 — Leaderboard

```
Mobile screen (375x812) for MemeFlow leaderboard.

[Apply GLOBAL STYLE]

HEADER: "排行榜" in 28px weight-800 #1D1D1F.
PERIOD: Glass Light segmented control — "本周" | "本月" | "总榜". Active: gradient text + gradient dot.

TOP 3 SECTION (no card — floating on background):
  Three avatar circles horizontally centered:
  - #1 CENTER: 64px, thin gradient border (violet-to-rose), name below in weight-600 #1D1D1F, score in monospace #86868B
  - #2 LEFT: 48px, thin #E5E5EA border, name and score in #86868B
  - #3 RIGHT: 48px, thin #E5E5EA border, name and score in #86868B
  No medals. No podium. Size and the gradient ring communicate rank.

RANKING LIST (ONE Glass Medium card):
  All remaining ranks in a unified glass panel (iOS Settings pattern):
  Each row:
  - Rank number: #1-3 gradient text, #4+ in #C7C7CC monospace
  - Avatar: 32px circle
  - Name: weight-500 #1D1D1F
  - Title: tiny Glass Recessed pill ("梗学徒" in #86868B)
  - Score: monospace #86868B, right-aligned
  - Divider: #F5F5F7

  CURRENT USER ROW: the glass behind this specific row is slightly more opaque (white 80%) — a material spotlight. No colored background. Just a density shift in the glass.

FEEL: The leaderboard presents data, not theater. Rankings through typography and material hierarchy. If Apple made a competitive language app, this is what the leaderboard looks like.
```

---

## 使用说明

1. 打开 https://stitch.withgoogle.com/
2. **先粘「全局设计语言」**作为系统设定
3. 然后一个个粘各页面 prompt
4. 建议顺序：先 **#8 登录页** + **#1 翻译页** 看整体风格是否满意
5. 满意后生成剩余 8 页
6. 截图发我，我按确定方案写代码

## 设计核心要点速查

| 要素 | 规则 |
|------|------|
| 颜色使用 | 整个界面只有一个渐变 (violet→rose)，其余全是灰度 |
| 玻璃层级 | 4 层：Light(55%) → Medium(65%) → Heavy(75%) → Recessed(凹) |
| 深度感 | 越重要的内容 → 越不透明的玻璃 → 越"靠近"用户 |
| 留白 | 每屏最多 2-3 个元素，32px 内边距 |
| 文字颜色 | 只用三档：#1D1D1F / #86868B / #C7C7CC |
| 卡片 vs 列表 | 列表用单一玻璃面板内的行，不要每行一个卡片 |
| Tab 指示器 | 2px 渐变圆点，不是背景色块 |
| CTA 按钮 | 全页面唯一有颜色的东西 |
