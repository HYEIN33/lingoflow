/**
 * AI Provider 抽象层 — 多模型路由的接口定义
 *
 * 这层让上层调用方（ai.ts 里的 translateText/explainSlang/...）不需要
 * 关心"我现在用 Gemini 还是 DeepSeek 还是豆包"。每个任务调
 *   getProviderForTask('translate')
 * 拿到一个 client，自然走对应的 API。
 *
 * 当前阶段（W1）：
 *   - 海外版 → 全部走 GeminiProvider（保持现版行为）
 *   - 国内版 → 还没实现，调用会 throw 提示
 *
 * 下阶段（W2）：
 *   - 实现 DeepSeekProvider（OpenAI 兼容协议，最快）
 *   - 实现 DoubaoProvider（火山引擎 SDK）
 */

import { getRegionConfig, isCN } from './environment';

/** memeflow 用 AI 做的所有任务类型。新增任务在这里加。 */
export type AITask =
  | 'translate'        // 翻译页（中英双向，含释义/例句）
  | 'slang'            // 梗百科解释 + 例句
  | 'classroom'        // 课堂同传段落翻译
  | 'classroomNotes'   // 课堂笔记摘要
  | 'grammar'          // 语法检查
  | 'chat';            // AI 问答（课堂同传里的 ask AI）

/**
 * 通用调用参数。所有 provider 实现都接受这个签名，让上层调用代码
 * 不需要根据 provider 切不同形状的入参。
 */
export interface AICallParams {
  /** 任务类型——provider 用它决定走哪个具体模型 */
  task: AITask;
  /** prompt 文本或多 part 结构 */
  contents: string | { parts: { text: string }[] }[];
  /** 可选的 JSON schema / temperature 等模型配置 */
  config?: Record<string, any>;
  /** 流式输出回调。不传 = 一次拿全文 */
  onChunk?: (delta: string) => void;
  /** 限流桶名。生产函数后端用它限流 */
  bucket?: string;
}

/** 任意 AI provider 必须实现的接口 */
export interface AIProvider {
  readonly name: string;
  generate(params: AICallParams): Promise<string>;
}

/**
 * 当前区域里"task → 模型"的路由表。
 * 海外版全部 Gemini；国内版按任务路由 DeepSeek / 豆包。
 */
export function getModelForTask(task: AITask): string {
  const cfg = getRegionConfig();
  return cfg.ai[task];
}

/**
 * 对外的工厂：给一个 task，返回应该用的 provider client。
 *
 * 第 1 阶段实现：
 *   - global 区域 → 走现有 ai.ts 的 geminiGenerate（已经存在的实现）
 *   - cn 区域    → 还没实现，throw
 *
 * 第 2 阶段实现：
 *   - cn 区域 → 根据 task 决定返回 DeepSeekProvider 还是 DoubaoProvider
 */
export function getProviderForTask(_task: AITask): AIProvider {
  if (isCN()) {
    throw new Error(
      '[aiProvider] CN region provider not yet implemented. ' +
      'See docs/cn-deployment-plan.md for roadmap.'
    );
  }
  // 海外版当前不走这层——ai.ts 直接调 Gemini SDK。
  // 后续重构时把 ai.ts 改成调 getProviderForTask().generate() 后才生效。
  throw new Error(
    '[aiProvider] Global provider routing layer is wired but not yet ' +
    'plumbed into ai.ts. Falling back to direct Gemini calls in ai.ts.'
  );
}
