# MemeFlow Stitch Prototyping Prompts

Use these prompts in https://stitch.withgoogle.com/ to generate UI prototypes for each page.

## Global Design Direction

**Base prompt (prepend to each page prompt):**
> A modern language learning app called MemeFlow. Style: clean, playful, Duolingo-meets-Xiaohongshu aesthetic. Primary color: blue-600 (#2563EB). Accent: indigo-600. CTA: amber-500. Background: soft gradient from light blue to lavender. Cards: large rounded corners (24px), subtle glass-morphism with backdrop blur. Font: Plus Jakarta Sans for English, Noto Sans SC for Chinese. Mobile-first responsive design.

---

## Page 1: Translate Page (Main Page)

> Design a translation app main screen. Top: glass-morphism tab bar with 5 tabs (Translate, Slang Wiki, Grammar, Wordbook, Review) — Translate tab is active with blue highlight. Below: a large rounded input field with placeholder "输入中文或英文..." (Type Chinese or English), a camera icon button, a microphone button, and a blue circular submit arrow button on the right side. Below the input: three scene selector chips labeled "聊天" (Chat), "商务" (Business), "写作" (Writing) — Chat is selected with a blue-to-indigo gradient background and white text, others are glass style. Below: a formality slider from "口语" (Casual) to "学术" (Formal) with a value of 50. At bottom: search history shown as compact rounded chips. Overall feel: clean, spacious, inviting to type.

## Page 2: Translation Result

> Same translate page but showing a result. Input shows "今天天气不错". Below: a result card with a gradient left accent border (blue to indigo). Card header: "⚡ 地道表达 (AUTHENTIC)" in gradient blue-purple text. Translation: "The weather's great today!" in large text. Below: a speaker icon "朗读" (Read aloud) button and a bookmark "收藏" (Save) button. Below the card: feedback section with "翻译质量:" label and thumbs-up/thumbs-down buttons. At bottom: original text card showing "今天天气不错" in a soft gray box. The result card should have a stagger animation feel — slightly elevated with a premium shadow.

## Page 3: Slang Dictionary (梗百科) Home

> Design a slang dictionary home page for Chinese internet culture. Top: same tab bar, "梗百科" tab active. Below: a collapsible "每日挑战" (Daily Challenge) banner in warm yellow/amber tones with a lightning bolt icon. Below: a search bar with placeholder "搜索网络热词、梗..." and a blue "搜索" button. Below: "本周搜索榜" (Weekly Trending) section — a numbered list of trending slang terms with rank badges (1-3 in red/orange/yellow gradient circles, 4+ in gray). Each row shows the term name and search count. At bottom: "浏览词条" (Browse Entries) section with tag-like chips of slang terms. Clean, content-discovery feel like Xiaohongshu/Reddit.

## Page 4: Slang Entry Detail (Magazine Layout)

> A slang dictionary entry page for "plot twist". Top: a compact hero header card with a thin gradient accent bar (blue-indigo-purple) at the very top. The word "plot twist" is large and bold on the left, with "1条释义" count below it, and action buttons "造句试试" and "+ 补充" on the right. Below the header: a micro-label "释义" (DEFINITIONS) in tiny uppercase tracking-wide text. Below: a numbered definition card — number "1" in a blue-indigo gradient rounded square badge, author "LingoFlow Bot" with avatar, "AI 85" quality score in green. The definition text is large and readable. Below: an example quote block with a left indigo accent border, showing the example sentence in italics. At bottom: action bar with a prominent thumbs-up button (large, rounded, with count), plus smaller share and audio buttons. Magazine editorial feel.

## Page 5: Review / Flashcard Page

> A spaced repetition flashcard review screen. Top: tab bar with "复习" active. Below: a progress bar showing "3/10" with a blue gradient fill. Main area: a 3D-style flashcard in the center — front side shows a large bold word (e.g., "ephemeral") with pronunciation below and a speaker button. A large blue "查看答案" (Show Answer) button at the bottom. The card should feel like it can flip in 3D. When flipped (show both states): the back shows the Chinese meaning, example sentence, and 4 SM-2 rating buttons in a 2x2 grid: "忘记" (Forgot) in red gradient with X icon, "模糊" (Hard) in yellow gradient with ? icon, "记得" (Good) in green gradient with thumbs-up icon, "秒杀" (Easy) in blue-indigo gradient with lightning icon. Each button has the next review interval below (1天后, ~3天, ~1周, ~2周). Game-like, satisfying to tap.

## Page 6: Login Page (Desktop Split-Screen)

> A premium login page with a left-right split layout. Left 52%: a deep gradient background from blue-600 via indigo-600 to purple-600. Floating decorative glass shapes with icons (globe, sparkles, chat bubble) gently bobbing up and down. Center: a large glass-morphism logo container with the MemeFlow icon, below it the app name "MemeFlow" in bold white, tagline "中文打字，地道英文秒出" in lighter blue text, and two pill badges "AI-Powered" and "梗百科". Right 48%: light gray-white background. A glass-card container with "欢迎回来" (Welcome back) heading. Primary CTA: a large blue-to-indigo gradient "Google 登录" button with Google G icon and shadow. Below: a divider "其他方式", then secondary buttons for "邮箱登录" and "内测邀请码". Premium, trust-inspiring.

## Page 7: Login Page (Mobile)

> Mobile version of the login page — single column. Top: MemeFlow logo and app name centered, tagline below. Below: the same glass-card login form — Google sign-in as primary large button, email login as secondary, invite code as text link. Clean, simple, fast to scan. Gradient background subtle, not overwhelming on small screen.

## Page 8: Payment / Upgrade Screen

> A pricing comparison modal or page. Header: "升级 Pro" with a yearly/monthly toggle. Two plan cards side by side: Free plan (muted gray, ¥0/月, basic feature list with gray check icons) and Pro plan (highlighted with blue-50 background, glowing blue border, "推荐" badge in amber gradient at corner, ¥xx/月 in large blue text, premium feature list with blue check icons). Pro features include: unlimited AI translations, spaced repetition, advanced grammar, tab customization. A large blue gradient "立即升级" CTA button at bottom. The Pro card should feel special — subtle glow, slightly elevated.

## Page 9: Wordbook (Vocabulary)

> A vocabulary list page. Top: "单词本" heading with a search bar and "批量" (Batch) button. Below: folder tabs ("全部 (5)", "新建") and filter chips (全部/地道/学术/标准). Main content: a list of word cards, each with a colored left border indicating style (blue for 地道/authentic, purple for 学术/academic, gray for 标准/standard). Each card shows: the Chinese phrase (bold), style tag badge, one-line definition preview, and action icons (speaker, delete, expand). Cards have subtle shadows and hover lift effect. Organized, scannable.

## Page 10: Grammar Check

> A grammar checker page. Top: tab bar with "语法检查" active. Main: a large rounded glass-morphism textarea with placeholder "输入句子以检查语法..." and right-side buttons (microphone, blue submit arrow). Below when empty: example sentence chips "I have went to the store yesterday", "She don't like coffee", "Me and him is friends" — rounded, glass style, hoverable. When results show: corrections with red strikethrough and green suggestions, overall score.

---

## Tips for Stitch

1. Generate one page at a time
2. Start with the Translate Page (most important, most used)
3. For mobile versions, add "mobile viewport, 375px width" to the prompt
4. For dark mode variants, add "dark theme with slate-900 background"
5. Iterate: if the first result is too generic, add more specific details about spacing, shadows, and the glass-morphism effect
