# MemeFlow Stitch Prompts v3 — Apple Liquid Glass

设计语言：Apple iOS 26 液态玻璃。面向年轻用户。淡色系高级感。

## 全局设计规范（每个 prompt 的前缀）

> **Global style rules (prepend to every prompt):**
> Apple Liquid Glass design language. Background: pure white (#FAFAFA) with ultra-subtle tinted blobs of lavender, mint, and peach that drift slowly behind content. Every card and panel is a frosted glass layer: `background: rgba(255,255,255,0.6); backdrop-filter: blur(24px) saturate(1.8); border: 1px solid rgba(255,255,255,0.7); border-radius: 24px`. Multiple glass layers stack with varying opacity to create depth. No solid backgrounds except for primary CTAs.
>
> **Typography:** System font stack that resembles SF Pro — clean, geometric sans-serif. Titles: weight 800, color #1D1D1F (almost-black), generous letter-spacing. Body: weight 400, color #86868B (Apple gray). Accent text: gradient from soft violet #8B5CF6 to rose #EC4899. Numbers and stats: tabular monospace.
>
> **Color:** Almost no color in the chrome. Accent is a single soft gradient (violet-to-rose) used sparingly — only on the primary CTA, active tab indicator (a tiny 2px dot below), and key stats. Everything else is grayscale glass. Think iOS Settings app, not Duolingo.
>
> **Spacing:** Extremely generous. 32px padding in cards on mobile. 24px gaps between sections. The page breathes. Content density is LOW — each viewport shows 2-3 elements maximum.
>
> **Motion concept:** Elements enter with `opacity: 0, scale: 0.97 → 1` over 500ms with Apple's cubic-bezier(0.22, 1, 0.36, 1). No bounce, no y-offset. Glass panels have a subtle parallax depth — closer panels blur less, farther panels blur more.
>
> **Icons:** Thin line-style icons (1.5px stroke), never filled. Minimal, SF Symbols aesthetic.
>
> Mobile viewport: 375x812 (iPhone 15 Pro). Status bar visible.

---

## 1. 翻译页 — Translation (Main Screen)

```
Design a mobile screen (375x812, iPhone 15 Pro) for a language learning app called MemeFlow.

Apple Liquid Glass style. Background: off-white #FAFAFA. Behind all content, three large soft color blobs drift: a lavender blob (#E9D5FF at 20% opacity) top-left, a mint blob (#A7F3D0 at 15% opacity) center-right, and a peach blob (#FECDD3 at 12% opacity) bottom-center. Each blob is ~200px diameter, heavily blurred (blur: 80px).

Status bar: standard iOS style.

Navigation: a frosted glass bar floating below the status bar. Logo: a small 32px rounded-square icon with a violet-to-rose gradient, containing a thin white translate symbol. "MemeFlow" in weight-700, color #1D1D1F. Right side: three ghost icon buttons (trophy, avatar circle, globe) in #86868B, 20px thin-line style.

Tab selector: 5 tabs arranged horizontally in a frosted glass pill container (blur: 20px, white 60% opacity). Each tab is just text — "翻译", "梗百科", "语法检查", "单词本", "复习". Active tab "翻译" has a tiny 2px dot underneath in violet-to-rose gradient, and the text is #1D1D1F. Inactive tabs are #86868B. No backgrounds on individual tabs, no icons.

Main input area: a large frosted glass card (blur: 24px, white 65%, rounded 28px, border: 1px solid white 70%). Inside: placeholder "输入中文或英文..." in #C7C7CC (Apple placeholder gray). Bottom-right of the card: a row of three thin-line icon buttons (camera, mic in #86868B) and one filled circular CTA button (32px, violet-to-rose gradient, white arrow icon, subtle shadow matching the gradient at 25% opacity).

Below input: "场景" label in tiny uppercase #86868B tracking-widest. Three text chips: "聊天" (active — text is gradient violet-to-rose, with a thin gradient border), "商务", "写作" (both in #86868B with thin #E5E5EA borders). Chips are pill-shaped, minimal.

Below: a section labeled "搜索记录" in tiny #C7C7CC text, right-side "清空" link. History items as subtle text tags in #86868B on thin glass chips. Compact, scannable.

The overall impression: an iOS Settings page had a baby with a premium translation app. Ultra-clean, confident in its whitespace, not trying to impress with color — the glass layers and gradient accent do all the work.
```

## 2. 翻译结果页 — Translation Result

```
Same MemeFlow app, same Apple Liquid Glass style. Now showing translation result.

Input card shows "今天天气不错" in the frosted input area.

Below: a translation result displayed as a layered glass card composition:

OUTER LAYER: a large frosted glass card (white 60%, blur 24px, 28px radius). Inside:

INNER CARD 1 (Authentic): a slightly more opaque glass layer (white 70%) nested inside. Top-left: a small pill badge "⚡ 地道" with gradient text (violet-to-rose) and a thin gradient border. The translation "The weather's great today!" in #1D1D1F, weight 600, size 20px. Below: a thin divider line (#F5F5F7).

Below the divider: a social-style action row. Left: a heart icon (thin line, #C7C7CC, tappable — when tapped becomes filled gradient). "收藏" label in tiny #86868B. Center: a waveform/speaker icon for "朗读". Right: a share icon. All icons are thin-line 18px, #86868B, with generous spacing between them.

Below the inner card: "翻译质量" micro-label. Two reaction pills side by side: "👍 赞" and "👎 改进" — both frosted glass chips with thin borders. When one is tapped, it fills with a subtle tint.

At very bottom: "原文" section — just the original text "今天天气不错" in a lighter glass layer (white 50%, blur 16px), smaller text, #86868B color. Almost fading into the background — it's reference, not the focus.

Key: the glass layers create DEPTH. The translation result is the closest (most opaque) layer. The original text is the farthest (most transparent). This creates a natural visual hierarchy through material, not color.
```

## 3. 梗百科首页 — Slang Dictionary Home

```
Mobile screen (375x812) for MemeFlow slang dictionary home.

Apple Liquid Glass. Off-white background with drifting lavender/mint/peach blobs.

Tab: "梗百科" active (gradient dot indicator).

Content sections, each in its own glass layer:

SECTION 1 — "每日挑战" banner: a frosted glass card with a very subtle warm tint (peach at 5% mixed into the white). Inside: a thin-line lightning bolt icon in gradient, "每日挑战" in #1D1D1F weight-700, a subtle chevron-right on the far right. Minimal — one line, no description until expanded.

SECTION 2 — Search: a frosted glass input card. Thin-line magnifying glass icon #C7C7CC left. Placeholder "搜索网络热词..." in Apple placeholder gray. Right: a small pill button "搜索" with gradient background and white text (the ONLY colored element on this half of the screen).

SECTION 3 — "本周热门" (Trending): a frosted glass card. Title in tiny uppercase #86868B. A list of trending terms — each row is:
- Rank number in gradient text (only #1-3 use gradient, #4+ use #C7C7CC)
- Term name in #1D1D1F weight-600
- Search count in monospace #86868B on the right
- Thin #F5F5F7 divider between rows
No cards around individual items — just clean text rows inside the glass panel.

SECTION 4 — "浏览" (Browse): horizontal scroll of term chips. Each chip is a small frosted glass pill with term text in #86868B. On hover/tap the chip gets a subtle gradient border. Understated.

The page looks like it has maybe 60% content and 40% breathing room. Premium editorial magazine feel.
```

## 4. 梗百科词条详情 — Slang Entry Detail

```
Mobile screen (375x812) for slang entry "plot twist" in MemeFlow.

Apple Liquid Glass style.

Header area (NOT a card — text directly on the background):
- "plot twist" in very large (34px) weight-800 #1D1D1F text
- Below: "1 条释义" in tiny #86868B monospace
- Right side: two ghost buttons "造句试试" and "+ 补充" in thin glass pills with #86868B text and thin borders

Below: the definition in a frosted glass card.

Glass card structure:
- Top row: tiny avatar circle (gradient border), "LingoFlow Bot" in small #86868B, "AI 85" quality score in a subtle glass pill with gradient text on the right
- Definition text: large (18px), #1D1D1F, weight-500, generous line-height (1.7). The text IS the card's hero. "影视文化的梗，指意想不到的转折，用来描述生活里的意外"
- Example block: slightly recessed glass layer (white 50%) inside the card. Left accent: a 2px gradient line (violet-to-rose). Italic text in #86868B: "Plot twist: I actually passed the exam."
- Action row at bottom: thin divider, then icons spaced generously. Heart (empty thin-line), comment bubble with count, share icon, speaker icon. All in #C7C7CC, 18px thin-line. The heart turns gradient-filled when tapped.

Below the card: comment section — just text inputs and small text. No heavy UI. Apple Messages-level simplicity.
```

## 5. 语法检查 — Grammar Check

```
Mobile screen (375x812) for MemeFlow grammar checker.

Apple Liquid Glass. Tab: "语法检查" active.

Main: a large frosted glass textarea card (blur 24px, 28px radius). Placeholder "输入句子以检查语法..." in #C7C7CC. The card is tall (takes up ~40% of viewport), inviting long input. Bottom-right: thin-line mic icon and a gradient CTA circle (arrow icon).

Below when empty: "试试这些 :" micro-label in #C7C7CC. Three example pills in a row — each is a thin frosted glass chip with English text in #86868B. "I have went to the store yesterday" · "She don't like coffee" · "Me and him is friends". Tapping one fills the textarea.

When showing results: the textarea shrinks, and below it a result glass card appears. Errors shown with a subtle red-tinted glass highlight behind the wrong words, correct version in green-tinted glass. Score: "85" in large gradient monospace text with a thin circular progress ring around it (gradient stroke, gray track).

Clinical precision meets glass aesthetics.
```

## 6. 单词本 — Wordbook

```
Mobile screen (375x812) for MemeFlow vocabulary book.

Apple Liquid Glass. Tab: "单词本" active.

Header: "单词本" in large #1D1D1F weight-800. Search: frosted glass input with thin-line search icon.

Filter row: text-only pills. "全部" (active, gradient text + gradient dot below), "地道", "学术", "标准" in #86868B.

Word list: each word is a row inside a single large frosted glass card (the whole list is one panel, not individual cards per word).

Each row:
- Left: a 3px rounded accent line. Gradient (violet-to-rose) for 地道, soft purple for 学术, #E5E5EA for 标准.
- Word in #1D1D1F weight-600
- One-line translation in #86868B below
- Right: thin chevron-right #C7C7CC
- Thin #F5F5F7 divider between rows

The single-panel list feels like iOS Settings — unified glass surface, not floating individual cards. Clean, scannable, high information density within a premium container.
```

## 7. 复习/闪卡 — Review Flashcards

```
Mobile screen (375x812) for MemeFlow spaced repetition review.

Apple Liquid Glass. Tab: "复习" active.

Top: a thin progress line (not a bar — just a 2px gradient line showing progress) with "3/10" in tiny monospace #86868B on the right.

Center: a large frosted glass card (the flashcard). Takes up ~50% of the viewport. Inside:

FRONT STATE:
- Tiny "3 / 10" in #C7C7CC top-center
- The word "ephemeral" in 36px weight-800 #1D1D1F, centered
- Pronunciation "/ɪˈfemərəl/" in #86868B monospace below
- A thin-line speaker icon centered below that
- Large gap, then: "查看答案" as a text button (NOT a filled button) — just gradient text, weight-600, tappable. Below it a thin line extending left and right, like a pull-to-reveal hint.

BACK STATE (show this too, as if the card flipped):
- Word at top in smaller text
- Chinese meaning in #1D1D1F weight-600
- English definition in #86868B
- Example in a recessed glass layer with gradient left accent

Rating: 4 emoji reaction circles arranged in a row below the card:
😫  🤔  😊  🤩
Each sits in a frosted glass circle (64px diameter). Below each: tiny label "忘记" / "模糊" / "记得" / "秒杀" in #C7C7CC, and interval "1天" / "~3天" / "~1周" / "~2周" in even tinier text.

When tapped, the selected circle briefly shows a gradient border and the emoji scales up. Apple-smooth spring animation.

The whole experience feels meditative, not gamified. You're reviewing words in a calm, beautiful environment.
```

## 8. 登录页 — Login

```
Mobile screen (375x812) for MemeFlow login page.

Apple Liquid Glass. Full off-white (#FAFAFA) background with the three drifting color blobs (lavender, mint, peach) more prominent here — they slowly pulse in opacity.

Center composition:
1. Logo: a 64px rounded-square icon with gradient (violet-to-rose), containing a thin white translate symbol. Subtle shadow matching the gradient.
2. "MemeFlow" in 32px weight-800 #1D1D1F
3. Tagline "中文打字，地道英文秒出" in 16px #86868B, generous line-height

Below (inside a frosted glass card, 28px radius, generous 32px padding):
4. Primary CTA: a full-width button with gradient background (violet-to-rose), "Google 登录" in white weight-600, with a small Google "G" icon. Rounded 16px. Subtle gradient shadow.
5. Divider: thin line with "或" in #C7C7CC center
6. "邮箱登录" — a ghost button with thin #E5E5EA border and #86868B text
7. Tiny text link: "内测邀请码" in #C7C7CC

Very bottom: "v0.1.1" and "Beta" in a tiny frosted glass pill, #C7C7CC.

The login page is 70% whitespace. The gradient CTA is the ONLY colorful element. It draws your eye immediately. Premium, confident, Apple-store-product-page energy.
```

## 9. 支付/升级页 — Payment

```
Mobile screen (375x812) for MemeFlow Pro upgrade.

Apple Liquid Glass. A bottom sheet or full page.

Header: "升级 Pro" in weight-800 #1D1D1F. Toggle: "月付" / "年付 省40%" — a frosted glass segmented control, active segment has subtle gradient text.

Two plan glass cards stacked vertically:

FREE CARD: a frosted glass card (very transparent — white 45%, blur 16px). "Free" in #C7C7CC. "¥0" in #86868B. Feature list in #C7C7CC with thin-line check icons in #D1D1D6. The whole card feels deliberately dim.

PRO CARD: a more opaque frosted glass card (white 70%, blur 24px) with a thin gradient border (violet-to-rose at 40% opacity — not screaming, just a whisper of color). "Pro" in gradient text. "¥xx/月" in large #1D1D1F. Feature list in #1D1D1F with gradient check icons. A small "推荐" pill in gradient at the top corner.

Below: the CTA "立即升级" — full-width gradient button, the only vivid element. Subtle: "7天免费试用" text below in #86868B.

The contrast between Free (ghostly, almost invisible) and Pro (solid, present, the only thing with color) does all the selling. No need for flashy badges or animation — the material hierarchy speaks.
```

## 10. 排行榜 — Leaderboard

```
Mobile screen (375x812) for MemeFlow leaderboard.

Apple Liquid Glass.

Header: "排行榜" in weight-800 #1D1D1F. Period selector: frosted glass segmented control "本周 / 本月 / 总榜".

Top 3 section: three avatar circles in a horizontal row, centered. #1 in the middle and larger (64px), #2 left (48px), #3 right (48px). Below each: name in weight-600, score in monospace. #1 has a subtle gradient ring around the avatar. #2 and #3 have thin #E5E5EA rings. No medals, no podiums — just size hierarchy and the gradient ring.

Below: a single frosted glass card containing the full ranking list. Each row:
- Rank number in monospace (#1-3 in gradient, rest in #C7C7CC)
- Small avatar (32px)
- Name in #1D1D1F weight-500
- Title in a tiny frosted glass pill (#86868B text)
- Score on the right in monospace #86868B
- Thin divider

Current user row: the glass behind that row is slightly more opaque (white 80%), creating a subtle spotlight effect. No colored background — just a material difference.

Restrained, elegant. The leaderboard doesn't shout — it presents.
```

---

## 使用方法

1. 打开 https://stitch.withgoogle.com/
2. 先粘 **全局设计规范** 段落作为系统设定
3. 再粘各页面 prompt，建议先生成 **翻译页 (#1)** 和 **登录页 (#8)** 对比效果
4. 满意后生成全部 10 个页面
5. 截图发给我，我按照确定的风格实现代码

## 设计关键词速查

| 元素 | 实现 |
|------|------|
| 背景 | #FAFAFA + 3个漂浮色斑(lavender/mint/peach) |
| 玻璃面板 | rgba(255,255,255,0.6) + blur(24px) + saturate(1.8) + 1px white border |
| 主色 | 仅 violet→rose 渐变，用于 CTA/active indicator/gradient text |
| 文字 | #1D1D1F(标题) / #86868B(正文) / #C7C7CC(占位符) |
| 圆角 | 24-28px 卡片，16px 按钮，999px 药丸 |
| 动画 | cubic-bezier(0.22, 1, 0.36, 1), 无弹跳 |
| 留白 | 极致 — 每个视口最多 2-3 个元素 |
