---
title: "TranslateTab 29 Props → Context + 结构测试 → 行为测试"
category: developer-experience
module: translate
component: testing_framework
severity: medium
tags: [react-context, prop-drilling, behavioral-testing, testing-library, refactoring]
problem_type: developer_experience
root_cause: scope_issue
resolution_type: code_fix
applies_when: "Component has 10+ props drilled from parent, or tests use regex/readFileSync to match source code"
related_components: [TranslateTab, TranslateContext, App]
date: 2026-04-13
---

# TranslateTab 29 Props → Context + 结构测试 → 行为测试

## Context

TranslateTab 从 App.tsx 接收 29 个独立 props（输入状态、翻译结果、音频、反馈、场景等）。每加一个功能需要同时改 App.tsx（传 prop）和 TranslateTab.tsx（接收 prop），形成双文件锁步。

同时，24 个"测试"用 `readFileSync` + regex 匹配源码文字（比如检查 `clearTimeout(autoTimerRef.current)` 是否存在于源码中）。这些测试只验证代码的"样子"，不验证"行为"。任何重构（改函数名、搬位置）都会让测试红掉，即使功能完全正常。

gstack autoplan Eng Review 标记为 E5 (29 props 维护灾难) 和 E7 (结构测试假信心)。

## Guidance

### 1. React Context 替代 Props Drilling

创建 `src/contexts/TranslateContext.tsx`：

```typescript
// 定义 Context 类型，按语义分组
export interface TranslateContextValue {
  inputText: string;
  setInputText: (v: string) => void;
  isTranslating: boolean;
  translationResult: TranslationResult | null;
  // ... 29 个字段按组排列
}

const TranslateContext = createContext<TranslateContextValue | null>(null);

export function TranslateProvider({ value, children }: {
  value: TranslateContextValue;
  children: React.ReactNode;
}) {
  return <TranslateContext.Provider value={value}>{children}</TranslateContext.Provider>;
}

export function useTranslateContext(): TranslateContextValue {
  const ctx = useContext(TranslateContext);
  if (!ctx) throw new Error('useTranslateContext must be used within TranslateProvider');
  return ctx;
}
```

App.tsx 用 Provider 包裹，不再逐个传 props：

```tsx
// Before: 29 individual props
<TranslateTab inputText={inputText} setInputText={setInputText} ... />

// After: Provider 一次传入
<TranslateProvider value={{ inputText, setInputText, isTranslating, ... }}>
  <TranslateTab />
</TranslateProvider>
```

### 2. 兼容性：Context + Props 双模式

TranslateTab 支持从 Context 或 Props 获取数据，让测试不需要 Provider：

```typescript
export default function TranslateTab(props?: Partial<TranslateTabProps>) {
  const ctxRaw = (() => {
    try { return useTranslateContext(); } catch { return null; }
  })();
  const { inputText, setInputText, ... } = (ctxRaw || props) as TranslateTabProps;
```

生产环境用 Context（Provider 在 App.tsx）。测试直接传 props（不需要包 Provider）。

### 3. 行为测试替代结构测试

关键原则：**先写行为测试，再做重构**。行为测试天然抗重构（测的是渲染输出），regex 测试不抗（匹配代码位置）。

```typescript
// Before: 结构测试（regex 匹配源码）
const source = readFileSync('TranslateTab.tsx', 'utf-8');
expect(source).toMatch(/aria-label/);  // 只检查字符串存在

// After: 行为测试（渲染组件，验证用户体验）
render(<TranslateTab {...defaultTranslateTabProps()} />);
expect(screen.getByLabelText('拍照翻译')).toBeInTheDocument();  // 真正渲染并查找
```

Mock 外部依赖：

```typescript
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  // ...
}));

vi.mock('motion/react', () => {
  const R = require('react');
  return {
    motion: {
      div: R.forwardRef((p, ref) => R.createElement('div', { ...p, ref }, p.children)),
    },
    AnimatePresence: (p) => p.children,
  };
});
```

## Why This Matters

- **29 props** 意味着每个新功能改两个文件。Context 只改 Provider 内部 + 消费组件。
- **Regex 测试**在代码在注释里也能通过。行为测试真正运行组件，发现真实 bug。
- 重构前有行为测试保护，重构可以放心改函数名、搬逻辑，测试不会假红。
- 这个模式从 24 个 regex 测试 → 23 个行为测试，覆盖相同场景但更可靠。

## When to Apply

- 组件从父级接收 **10+ props**
- 测试文件里有 `readFileSync` + `match(regex)` 模式
- 计划对组件做重构（改名、搬逻辑、拆分）
- gstack autoplan 报 "prop explosion" 或 "structural tests"

## Examples

### Props 数量对比

| 改动前 | 改动后 |
|--------|--------|
| TranslateTab: 29 个独立 props | TranslateTab: 0 props（从 Context 获取） |
| App.tsx: 40 行 prop 传递代码 | App.tsx: 8 行 Provider value |
| 加一个功能: 改 2 个文件 | 加一个功能: 改 1 个文件 |

### 测试对比

| 改动前 | 改动后 |
|--------|--------|
| 24 个 regex 测试 | 23 个行为测试 |
| `readFileSync` + `match()` | `render()` + `screen.getByLabelText()` |
| 重构必红 | 重构安全 |
| 注释里有代码也通过 | 真正渲染验证 |

## Related

- `docs/solutions/bugs/localstorage-schema-crash-2026-04-12.md` — 同项目测试模式参考
- gstack autoplan Eng Review E5, E7
