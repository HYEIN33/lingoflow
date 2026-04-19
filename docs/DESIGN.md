# MemeFlow Design System

## Colors

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `blue-600` | Buttons, links, active states |
| Primary Light | `blue-50/100` | Chip backgrounds, hover states |
| Accent | `indigo-600/700` | Slang sidebar gradient, slang chips |
| CTA | `amber-500` | Pro upsell, auto-translate toggle active |
| Destructive | `red-500` | Delete, error, thumbs-down active |
| Success | `green-400/600` | Thumbs-up active, mastered indicator |
| Warning | `yellow-400` | Learning indicator |
| Neutral | `gray-50` to `gray-900` | Text hierarchy, borders, backgrounds |
| Background | `from-blue-50 via-indigo-50/30 to-purple-50/20` | Page gradient |

## Typography

| Level | Class | Usage |
|-------|-------|-------|
| Hero | `text-3xl sm:text-4xl font-black tracking-tight` | Page titles (单词本, 复习, 排行榜) |
| Heading | `text-2xl font-bold` | Section titles |
| Subheading | `text-lg font-semibold` | Card titles |
| Body | `text-sm sm:text-base` | Main content |
| Secondary | `text-xs text-gray-500` | Descriptions, metadata |
| Micro Label | `text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]` | Section labels (场景, 正式度) |
| Badge | `text-[9px] font-bold uppercase` | Style tags (地道/学术) |

## Spacing

| Pattern | Class | Usage |
|---------|-------|-------|
| Card padding | `p-5 sm:p-8` | Main content cards |
| Section gap | `space-y-6` or `space-y-8` | Between card sections |
| Inline gap | `gap-1.5` to `gap-3` | Between chips, buttons |
| Page top | `pt-6 sm:pt-8` | Main content area |

## Components

### Card
```
bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100
```

### Chip / Tag
```
px-2.5 py-1 text-xs font-medium rounded-lg border
```
Variants: `bg-blue-50 text-blue-600 border-blue-100` (active), `bg-gray-50 text-gray-500 border-gray-200` (inactive)

### Icon Button
```
p-2 rounded-xl transition-all hover:scale-105 active:scale-95
focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
```

### Input
```
w-full bg-white border-2 border-transparent focus:border-blue-500
focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
rounded-3xl py-4 sm:py-6 pl-6 sm:pl-8 text-lg sm:text-xl
shadow-xl shadow-gray-200/50 outline-none transition-all placeholder:text-gray-300
```

### Skeleton (loading placeholder)
```
animate-pulse bg-gray-200 rounded-lg
```
Use `TranslationSkeleton`, `SlangInsightSkeleton`, `WordbookListSkeleton` from `src/components/Skeleton.tsx`.

## States

| State | Pattern |
|-------|---------|
| Loading | `Loader2 animate-spin` icon or skeleton component |
| Error | `sonner toast.error()` + `Sentry.captureException()` |
| Empty | Centered icon (gray-300) + text (gray-400) + subtitle (gray-300) |
| Success | `sonner toast.success()` with checkmark |

## Responsive

| Breakpoint | Width | Tab Layout |
|------------|-------|------------|
| Mobile | < 640px | Single column, tab bar scrollable with fade hint |
| Tablet | 640-1023px | Single column, all tabs visible |
| Desktop | >= 1024px | Translate: max-w-5xl (3-col grid). Other pages: max-w-3xl |

## Motion

All transitions use `motion/react` (framer-motion):
- Page entry: `initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}`
- Content toggle: `AnimatePresence` with fade
- Button press: `hover:scale-105 active:scale-95`

## Accessibility

- All icon buttons must have `aria-label`
- Key interactive elements must have `focus-visible:ring-2 focus-visible:ring-blue-500`
- Translation result area has `aria-live="polite"` for screen reader announcements
- Touch targets minimum 44px on mobile
