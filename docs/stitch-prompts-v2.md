# MemeFlow Stitch Prototyping Prompts v2

3 个风格方向 x 9 个页面 = 27 个 prompt。粘贴到 https://stitch.withgoogle.com/ 生成原型。

产品背景：MemeFlow 是一个中英翻译+梗百科+间隔复习的语言学习 app。用户输入中文，AI 输出地道英文。核心功能：翻译（聊天/商务/写作场景）、梗百科（中文互联网热词词典）、语法检查、单词本、SM-2 间隔复习。

---

## 风格 A：多邻国明亮活泼风

**Visual thesis:** Bright, bouncy, game-like. Lime green (#84CC16) and sky blue (#0EA5E9) primary duo. Extra-large rounded corners (28px), chunky buttons with 3D depth shadows, mascot-energy icons. Every interaction feels like earning XP. White background with pastel section tints.

**Typography:** Nunito (rounded sans-serif) for headlines, DM Sans for body. Bold weights everywhere.

**Motion:** Bouncy spring animations on every tap, confetti on completion, progress bars that pulse.

---

### A1. 翻译页（Translation — Main Screen）

```
Design a mobile app screen (375x812) for a language learning app called MemeFlow.

Style: Duolingo-inspired, bright and game-like. Background: clean white with a subtle mint-green (#F0FDF4) tint at top. All corners very rounded (28px for cards, 999px for pills).

Top bar: MemeFlow logo (a playful rounded square icon in lime green #84CC16 with a white translate symbol inside), app name "MemeFlow" in chunky bold Nunito font, a green "PRO" badge pill, and small icon buttons for leaderboard (trophy) and profile (avatar circle).

Tab bar below header: 5 tabs in a rounded pill container with light gray background. Tabs: "翻译" (active, white background with sky-blue text and a subtle drop shadow), "梗百科", "语法检查", "单词本", "复习". Each tab has a small icon left of the label.

Main content:
1. A large, friendly input card with thick rounded borders. Placeholder text "输入中文或英文..." in light gray. Inside the card's bottom-right: a teal camera button, a microphone button, and a big lime-green circular arrow submit button with a chunky shadow underneath (3D effect).

2. Three scene selector pills below the input: "聊天" (selected — lime green background, white text, slight scale-up), "商务" (light gray), "写作" (light gray). Rounded pill shape.

3. A translation result card showing:
   - A small green lightning bolt icon with "地道表达 (AUTHENTIC)" label in green
   - Large text: "The weather's great today!"
   - A speaker icon button labeled "朗读"
   - A bookmark icon button labeled "收藏"
   - Below: "翻译质量:" with a green thumbs-up and gray thumbs-down button

4. An "原文" (Original) section at bottom showing "今天天气不错" in a soft gray rounded box.

Overall feel: cheerful, clean, makes learning feel like a game. Big touch targets, playful shadows.
```

### A2. 梗百科首页（Slang Dictionary Home）

```
Mobile app screen (375x812) for MemeFlow slang dictionary home page.

Same Duolingo-bright style: white background, lime green (#84CC16) and sky blue (#0EA5E9) accents, chunky rounded corners (28px), Nunito bold font.

Tab bar: "梗百科" tab is active (white with blue text).

Content:
1. A playful yellow (#FEF3C7) banner card: "⚡ 每日挑战" (Daily Challenge) with a chevron to expand. Feels like a daily quest in a game.

2. Search bar: large rounded input with magnifying glass icon, placeholder "搜索网络热词、梗...", and a sky-blue "搜索" button on the right.

3. "🔥 本周搜索榜" (Weekly Trending) section: a numbered list with game-style rank badges. #1 has a red circle with "1" in white (looks like a level badge), #2 orange, #3 yellow, #4+ plain gray. Each row: rank badge, term name in bold, search count on the right. Terms include: "plot twist", "典", "六女一", "kskbl", "白月光". The list has a card-like container with subtle shadow.

4. "浏览词条" (Browse Entries) section: a horizontal scrollable row of rounded tag chips in pastel colors (mint, lavender, peach), each showing a slang term. Feels like browsable content pills.

Fun, discovery-oriented, like browsing a game's achievement gallery.
```

### A3. 梗百科词条详情（Slang Entry Detail）

```
Mobile screen (375x812) for MemeFlow slang entry detail page for "plot twist".

Same bright style. White background, lime/blue accents, chunky corners.

Top: compact header card with a thin rainbow gradient bar at the very top (lime→blue→purple). Inside: "plot twist" in large Nunito black font on the left, "1条释义" count below, and two action pill buttons on the right: "造句试试" (sky blue) and "+ 补充" (lime green).

Below: A large definition card with:
- A circular numbered badge "1" in lime-green gradient with white text (top-left)
- Author row: small avatar circle "L", name "LingoFlow Bot", green "AI 85" quality score badge (right side)
- Definition text large and readable: "影视文化的梗，指意想不到的转折，用来描述生活里的意外，比如本来以为考砸了结果过了。"
- An example block with a left lime-green accent bar: italic quote "Plot twist: I actually passed the exam."
- Action bar at bottom: large thumbs-up button with count "0" (primary action, bigger), plus small flag, share, and speaker icon buttons

Card has a playful shadow and slight hover-lift feel. The definition feels like reading a fun wiki entry.
```

### A4. 语法检查页（Grammar Check）

```
Mobile screen (375x812) for MemeFlow grammar checker.

Bright Duolingo style. Tab bar: "语法检查" active.

Main: a large rounded textarea card with placeholder "输入句子以检查语法..." and action buttons (microphone in gray circle, blue arrow submit button) at the bottom-right of the card. The textarea has a subtle inner glow when focused.

Below when empty: "试试这些：" label, then 3 example sentence pills in pastel colors. "I have went to the store yesterday" in mint, "She don't like coffee" in lavender, "Me and him is friends" in peach. Each pill has rounded corners and a playful hover effect.

Clean, minimal, focused on the input. The empty state feels inviting, not bare.
```

### A5. 单词本页（Wordbook / Vocabulary）

```
Mobile screen (375x812) for MemeFlow vocabulary book.

Bright style. Tab: "单词本" active.

Header: "单词本" in large bold Nunito, with a search bar and "批量" (Batch) button to the right.

Folder tabs: "全部 (5)" active in blue pill, "新建" with dashed border.
Style filter chips: "全部" (active, blue), "地道", "学术", "标准".

Word cards in a vertical list. Each card has:
- A colored left border stripe: lime green for 地道 (authentic), purple for 学术 (academic), gray for 标准 (standard)
- Word in bold: "我在弄咖啡"
- A small style tag badge "地道表达" in blue
- One-line translation preview: "I'm making coffee."
- Small action icons: speaker, delete, expand arrow
- Card has rounded corners and subtle shadow, with a slight lift on hover

The list feels scannable and organized, like a well-kept study deck.
```

### A6. 复习/闪卡页（Review / Flashcards）

```
Mobile screen (375x812) for MemeFlow spaced repetition review.

Bright style. Tab: "复习" active.

Top: progress bar "3/10" with a lime-green gradient fill in a rounded track.

Center: a large 3D-style flashcard. The FRONT shows:
- Card counter "3 / 10" in tiny gray text
- A very large bold word: "ephemeral"
- Pronunciation: "/ɪˈfemərəl/" in blue mono font
- A speaker button
- A big lime-green "查看答案" (Show Answer) button at bottom with chunky 3D shadow

Show BACK side state too (as if flipped):
- Same card but showing answer content
- Chinese meaning in bold blue
- English definition below
- Example sentence in gray italic
- 4 game-style rating buttons in a 2x2 grid:
  - "忘记" (Forgot): red gradient, X icon, "1天后"
  - "模糊" (Hard): yellow gradient, ? icon, "~3天"
  - "记得" (Good): green gradient, thumbs-up icon, "~1周"
  - "秒杀" (Easy): blue gradient, lightning icon, "~2周"
  Each button has a chunky 3D press effect

The card flip feels like turning over a game card. Satisfying, tactile.
```

### A7. 登录页（Login）

```
Mobile screen (375x812) for MemeFlow login page.

Bright, welcoming. Background: soft gradient from mint (#F0FDF4) to sky blue (#F0F9FF).

Center-top: MemeFlow logo — large lime-green rounded square with white translate icon, bouncy appearance. Below: "MemeFlow" in large bold Nunito, tagline "中文打字，地道英文秒出" in gray.

Below: a white card with rounded corners containing:
1. Big lime-green "Google 登录" button with Google G icon — primary CTA, chunky shadow
2. Divider: "— 或 —"
3. "邮箱登录" secondary button in white with blue text
4. "内测邀请码" text link in gray

Bottom: "v0.1.1" and "Beta" badge in a small pill.

Feels like arriving at a fun app, not filling out a form.
```

### A8. 支付/升级页（Payment / Upgrade）

```
Mobile screen (375x812) for MemeFlow Pro upgrade page.

Bright style. Header: "升级 Pro ✨" with a monthly/yearly toggle.

Two plan cards side by side (or stacked on mobile):

FREE card: muted gray background, "Free" title in gray, "¥0/月", basic feature list with gray checkmarks. Feels intentionally plain.

PRO card: lime-green gradient border that glows subtly. White background. A "推荐" badge in amber/orange at the top corner. "Pro" title in bold blue with a sparkle icon. "¥xx/月" in large blue text. Premium feature list with blue checkmarks. Features: unlimited AI translations, spaced repetition, advanced grammar, tab customization. A pulsing lime-green "立即升级" CTA button at bottom.

The contrast between Free (boring) and Pro (exciting) is obvious and deliberate.
```

### A9. 排行榜（Leaderboard）

```
Mobile screen (375x812) for MemeFlow leaderboard.

Bright style. Header: "🏆 排行榜" in bold, with "本周" / "本月" / "总榜" tab pills.

Top 3 podium section:
- #1: large gold medal circle with "1", user avatar, name, and score. Gold gradient background glow.
- #2: silver medal, slightly smaller
- #3: bronze medal, slightly smaller
Arranged in a podium layout (1 in center higher, 2 and 3 on sides).

Below: a scrollable list of remaining ranks (#4, #5, #6...). Each row: rank number, avatar, username, title badge (like "梗学徒"), contribution count and streak count on the right. Current user's row highlighted in blue-50 background.

Game leaderboard energy. Makes you want to climb.
```

---

## 风格 B：暗色高级质感风

**Visual thesis:** Dark, precise, premium. Slate-900 (#0F172A) base, with electric blue (#3B82F6) as the single accent that cuts through the darkness. Thin borders, subtle surface elevation through brightness not shadow. Feels like a professional translation engine meets a developer tool. Monospace accents for code/pronunciation.

**Typography:** Geist Sans for UI, Geist Mono for code/numbers. Clean, technical, Swiss-design-influenced.

**Motion:** Minimal and precise. Fade transitions, no bounce. Subtle glow effects on focus states. Loading indicators are thin blue lines, not spinners.

---

### B1. 翻译页

```
Mobile app screen (375x812) for a language learning app called MemeFlow.

Style: Dark premium. Background: deep slate #0F172A. Cards: slate-800 (#1E293B) with thin slate-700 borders. Single accent color: electric blue #3B82F6. Rounded corners: 16px (not too round). Font: Geist Sans (clean, technical).

Top bar: dark glass effect (slate-900/80 with backdrop blur). MemeFlow logo in a small blue square, app name in white, "PRO" badge in blue pill, icon buttons in slate-400.

Tab bar: slate-800 container. Active tab: blue text with a thin blue underline indicator (not background fill). Inactive: slate-500 text.

Main:
1. Input area: slate-800 card with a thin border. When focused, border glows blue (#3B82F6/50). Placeholder in slate-500. Icons (camera, mic) in slate-400. Submit button: solid blue circle with white arrow, blue glow shadow.

2. Scene chips: "聊天" selected (blue border, blue text on dark), "商务" and "写作" in slate-700 with slate-400 text. Minimal, tag-like.

3. Translation result: slate-800 card with a thin blue left border. "⚡ AUTHENTIC" label in electric blue, monospace. Translation text in white, large. Speaker and save buttons in slate-400 with blue hover states.

4. Feedback: small thumbs buttons in slate-700, blue when active.

5. Original text in a darker slate-850 inset area.

Premium, focused, no visual noise. The blue accent pops against the dark like a neon sign.
```

### B2. 梗百科首页

```
Mobile screen (375x812) for MemeFlow dark slang dictionary home.

Dark premium style. Slate-900 background, slate-800 cards, blue #3B82F6 accent.

Tab: "梗百科" active with blue underline.

1. Daily challenge: slate-800 card with a thin amber (#F59E0B) left border. "⚡ 每日挑战" in amber text. Subtle, not loud.

2. Search: slate-800 input with blue focus glow. "搜索" button: blue solid.

3. Trending list: no card container, just clean rows with thin slate-700 dividers. Rank numbers: #1 in blue, #2 in slate-400, #3 in slate-500, rest in slate-600. Term names in white. Counts in slate-500 monospace. Clean data table aesthetic.

4. Browse entries: horizontal scroll of slate-700 chips with slate-300 text. Simple, tag-like.

Dense, information-forward. Feels like browsing a curated database.
```

### B3. 梗百科词条详情

```
Mobile screen (375x812) for MemeFlow dark slang entry "plot twist".

Dark style. Slate-900 background.

Header: "plot twist" in large white text, no card wrapper — just text against the dark background. Blue monospace "1 definition" count. Action buttons in slate-700 pills with slate-300 text.

Definition: slate-800 card with subtle elevation. Number "1" in a small blue circle. Author in slate-500 small text. Quality score "85" in a blue monospace badge. Definition text in slate-100, generous line-height. Example in a darker inset block with a blue left line, italic slate-400 text.

Action bar: upvote button with blue outline (count in blue monospace), other icons in slate-500.

Editorial, clean, the content is the hero.
```

### B4. 语法检查

```
Mobile screen (375x812) for MemeFlow dark grammar checker.

Dark style. Slate-800 textarea with blue focus glow border. Placeholder in slate-600. Submit button: blue circle.

Example pills: slate-700 background, slate-300 text, monospace font. Horizontal scroll. Minimal hover effect — just border changes to slate-600.

When showing results: corrections use red (#EF4444) strikethrough for errors and green (#22C55E) for suggestions, on the dark background. Score displayed in large blue monospace number.

Clinical, precise, like a code linter.
```

### B5. 单词本

```
Mobile screen (375x812) for MemeFlow dark wordbook.

"单词本" heading in white. Search: slate-800 input with blue focus glow.

Folder tabs: active in blue outline pill, others in slate-700.
Filter chips: active in blue text + blue border, others slate-600.

Word cards: slate-800 rows with thin dividers (no card shadow). Left accent line: blue for 地道, purple (#A78BFA) for 学术, slate-600 for 标准. Word in white, translation in slate-400. Action icons in slate-500.

Clean table layout. Dense but readable. Developer-tool aesthetic.
```

### B6. 复习/闪卡

```
Mobile screen (375x812) for MemeFlow dark flashcard review.

Progress: thin blue line on slate-800 track. "3/10" in blue monospace.

Card: slate-800 with thin slate-700 border. Word in large white text. Pronunciation in blue monospace.

"查看答案" button: blue outline, not filled. Clean, not gamified.

Back/answer state:
- Meaning in slate-100
- Example in slate-400 italic
- 4 rating buttons: stacked horizontal bar layout (not grid). Each is a full-width slate-700 bar. Color accents only on the left edge: red for 忘记, amber for 模糊, green for 记得, blue for 秒杀. Text in slate-200. Interval in monospace on the right.

Functional, not decorative. Keyboard-shortcut labels would feel natural here.
```

### B7. 登录页

```
Mobile screen (375x812) for MemeFlow dark login.

Full-screen slate-900. Center: MemeFlow logo — small blue square, "MemeFlow" in white Geist Sans below it. Tagline in slate-500.

Login card: no visible card — just content on the dark surface. Google button: white with dark text (stands out against the dark). Email button: slate-700 outline. Invite code: small slate-500 text link.

Thin blue horizontal rule separating sections. Version in slate-700 monospace at bottom.

Minimal, confident, no decoration.
```

### B8. 支付页

```
Mobile screen (375x812) for MemeFlow dark upgrade.

"升级 Pro" in white. Toggle: slate-700 pill with blue active state.

Free card: slate-800, muted. Everything in slate-500. Intentionally forgettable.

Pro card: slate-800 with a subtle blue border glow (box-shadow: 0 0 20px rgba(59,130,246,0.15)). "PRO" in blue. Price in large white + blue monospace. Feature list with blue check icons. "推荐" badge: small blue pill.

CTA: solid blue button, full width, slight glow. The only bright element on the page.

The glow effect makes Pro feel like the obvious choice without being pushy.
```

### B9. 排行榜

```
Mobile screen (375x812) for MemeFlow dark leaderboard.

"🏆 排行榜" in white. Period tabs: blue underline active.

Top 3: no podium — just larger rows. #1 has a gold (#FFD700) accent dot, #2 silver, #3 bronze. Names in white, scores in blue monospace.

List: clean rows, thin dividers. Rank in slate-600 monospace. Avatar circles. Current user row: thin blue left border highlight.

Data-forward, no theatrics. The numbers tell the story.
```

---

## 风格 C：小红书社区暖色风

**Visual thesis:** Warm, social, content-discovery-forward. Coral (#FF6B6B) and warm pink (#EC4899) as primary duo, cream white (#FFFBF0) background, peach and lavender soft accents. Rounded cards with subtle warm shadows. User avatars prominent everywhere. Feels like scrolling a social feed of language tips, not using a translation tool.

**Typography:** Outfit (geometric but friendly) for headlines, Noto Sans SC for Chinese body text. Mixed weights, generous line-height.

**Motion:** Smooth crossfades, card entrance with subtle scale-up, like content appearing in a feed. Heart animation on saves. Pull-to-refresh with a custom animation.

---

### C1. 翻译页

```
Mobile app screen (375x812) for a language learning app called MemeFlow.

Style: Xiaohongshu/Pinterest-inspired, warm and social. Background: cream white #FFFBF0. Primary accent: coral #FF6B6B. Secondary: warm pink #EC4899. Corners: 24px (soft, friendly). Font: Outfit for headlines, rounded and geometric.

Top bar: cream background with warm shadow. MemeFlow logo in a coral rounded square. App name in dark brown (#44403C). "PRO" badge in coral pill. Icons in warm gray.

Tab bar: cream container with peach (#FFF1E6) tint. Active tab: coral text on white with a coral dot indicator underneath (not full background). Rounded pill shape.

Main:
1. Input card: white with a warm shadow (peach-tinted). "输入中文或英文..." placeholder. Camera button in lavender, mic in warm gray, submit in coral circle with warm shadow.

2. Scene chips: "聊天" selected (coral background, white text), others white with warm-gray text and thin borders.

3. Translation result: white card with a coral left accent stripe and warm shadow. A small user avatar and "MemeFlow AI" label at top (social post feel). "地道表达" badge in coral pill. Translation text large and warm brown. Below: a pink heart "收藏" button (not bookmark — heart, like social), speaker button, share button.

4. "翻译质量" with heart and broken-heart icons instead of thumbs. Social reactions.

5. A "分享到..." (Share to...) prompt at the very bottom, encouraging sharing.

Feels like getting a translation recommendation from a friend, not a machine.
```

### C2. 梗百科首页

```
Mobile screen (375x812) for MemeFlow warm-social slang dictionary.

Cream background, coral/pink accents, Outfit font.

Tab: "梗百科" active with coral dot.

1. Daily challenge: a warm card with peach gradient background. "🔥 每日挑战" with a cute flame emoji. Feels like a social media daily trend.

2. Search: white input with coral "搜索" pill button. Warm shadow.

3. Trending: styled as a "热门话题" (Hot Topics) social feed section. Each trending term is a card (not a list row) with:
   - The term in bold
   - A preview of the top meaning
   - A fire/heat indicator showing popularity
   - Small user avatars showing who contributed
   Arranged in a 2-column Pinterest/waterfall grid.

4. Browse entries: horizontal scroll of pastel-colored rounded cards (peach, lavender, mint, lemon), each with a term and a small illustration-style icon.

Content-discovery feed. Makes you want to browse and learn casually.
```

### C3. 梗百科词条详情

```
Mobile screen (375x812) for MemeFlow warm-social slang entry "plot twist".

Cream background. Social card style.

Header area: "plot twist" in large coral/dark-brown text. A "🔥 热门" (Hot) trending badge. Contribution count "1条释义" and action pills.

Definition card styled like a social media post:
- Avatar + author "LingoFlow Bot" + timestamp "刚刚" (just now)
- A quality badge: "AI 评分 85" in a warm-orange pill
- Definition text in warm brown, generous spacing
- Example in a quoted block with a peach/coral left accent
- Below: reaction bar — pink heart "点赞 0", blue chat bubble "评论 0", green share icon "分享", coral bookmark "收藏"
- Small user avatar row: "还没有人点赞，成为第一个吧！"

Comment section below the card, like a social post's replies.

Feels like reading and reacting to content on Xiaohongshu, not consulting a dictionary.
```

### C4. 语法检查

```
Mobile screen (375x812) for MemeFlow warm grammar checker.

Cream background. White card textarea with warm shadow, coral submit button.

Examples as social-style suggestion pills: each in a pastel card (peach/mint/lavender) with a small pencil icon. Tappable, friendly.

Results styled as a teacher's feedback card: warm background, corrections in coral (error) and green (suggestion) with handwriting-style underlines. A "✨ 得分: 85" badge in coral.

Feels like getting feedback from a patient language tutor.
```

### C5. 单词本

```
Mobile screen (375x812) for MemeFlow warm wordbook.

"单词本" heading in dark brown Outfit font. Search bar in white with warm shadow.

View toggle: grid view and list view icons (default to card grid).

Word cards in a 2-column grid layout (Pinterest style):
- Each card: white with warm shadow and a pastel accent top stripe (coral for 地道, lavender for 学术, sage green for 标准)
- Word in bold brown, translation below
- Small heart icon to mark favorites
- Cards have slightly different heights to create waterfall effect

Style filter: horizontal scroll of pastel pill tags.

Gallery feel. Each word is a collectible, not an item in a spreadsheet.
```

### C6. 复习/闪卡

```
Mobile screen (375x812) for MemeFlow warm flashcard review.

Cream background. Progress bar in coral gradient.

Card: large white card with rounded corners and warm shadow. Front: word in large dark-brown text, pronunciation in coral. A coral "查看答案" button with a warm shadow.

Back/answer: meaning with a small teacher avatar icon. Example in a peach-tinted quote block.

4 rating buttons styled as emoji reactions (not colored bars):
- 😫 "忘记" (Forgot) — red-tinted circle
- 🤔 "模糊" (Hard) — yellow-tinted circle
- 😊 "记得" (Good) — green-tinted circle
- 🤩 "秒杀" (Easy) — blue-tinted circle

Each button is a large tappable circle with the emoji, label below, and interval. Like reacting to a story.

Fun, low-pressure, social-media-reaction feel.
```

### C7. 登录页

```
Mobile screen (375x812) for MemeFlow warm login.

Full cream background with a large coral blob shape in the top portion (decorative, organic). MemeFlow logo centered: coral rounded icon with white symbol.

"MemeFlow" in warm dark brown. Tagline "中文打字，地道英文秒出" in warm gray. A small illustration or decorative element — maybe two chat bubbles (one Chinese, one English) overlapping.

Login card: white with warm shadow. Google button: white with thin border and Google G (not coral — keep Google on-brand). "邮箱登录" in coral outline. Divider with a small heart icon.

Bottom: user testimonial quote in gray italic: "学语言从来没有这么好玩过！" (Learning language has never been this fun!) with small stars. Version and beta badge.

Warm welcome page that feels personal, not corporate.
```

### C8. 支付页

```
Mobile screen (375x812) for MemeFlow warm upgrade.

"升级 Pro ✨" in coral. Toggle in warm pill design.

Free card: cream background, muted. "免费" in gray.

Pro card: white with a coral gradient border (animated shimmer). Small confetti or sparkle decorations around it. "Pro" with a coral crown icon. Feature list with coral heart checkmarks (not generic checks). A "最受欢迎" (Most Popular) social proof badge.

Below Pro: small avatar row + "已有 2,847 人升级" (2,847 people upgraded) social proof.

CTA: coral gradient button "立即升级" with warm shadow. A "7天免费试用" subtitle.

Social proof and FOMO elements, warm and encouraging, not pushy.
```

### C9. 排行榜

```
Mobile screen (375x812) for MemeFlow warm leaderboard.

"🏆 排行榜" in dark brown. Period tabs in coral pills.

Top 3: styled as a social podium with large circular avatars. #1 center (bigger, gold crown decoration), #2 left (silver), #3 right (bronze). Each has name, title, and score below. Background: warm gradient (peach to cream).

List: social feed style. Each row is a mini profile card: rank badge, large avatar, name, title badge in a pastel pill (like "梗学徒" in mint pill), stats on the right (contributions, streak fire emoji).

Current user: highlighted in coral-50 with a "← 这是你" (This is you) arrow label.

Community leaderboard. Makes you feel part of a group, not isolated.
```

---

## 使用方法

1. 打开 https://stitch.withgoogle.com/
2. 选择一个风格方向（A/B/C），粘贴对应页面的 prompt
3. 建议从翻译页（最核心页面）开始，每个风格各生成一版对比
4. 确定风格后，再生成该风格的所有 9 个页面
5. 把 Stitch 生成的截图发给我，我按照选定风格实现代码
