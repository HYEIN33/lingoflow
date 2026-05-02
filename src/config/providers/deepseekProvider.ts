/**
 * DeepSeek Provider — OpenAI 兼容协议实现
 *
 * DeepSeek API 使用与 OpenAI Chat Completions 完全相同的协议（path、
 * 请求体、响应结构都一致），所以可以用 fetch 直接调用，不需要装 SDK。
 *
 * 文档：https://api-docs.deepseek.com/
 *
 * 用途映射（见 environment.ts）：
 *   - translate / classroomNotes / grammar / chat → deepseek-chat (v3)
 *   - 课堂同传 → 走 DoubaoProvider 不走这里（延迟更低）
 *   - 梗百科 → 走 DoubaoProvider（年轻语料更贴）
 */

import type { AIProvider, AICallParams } from '../aiProvider';
import { getModelForTask } from '../aiProvider';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

/**
 * 把我们内部的 contents 格式（兼容 Gemini 风格 string | parts[]）
 * 转成 OpenAI Chat Completions 的 messages 数组。
 *
 * 一开始只支持单 user message——所有 memeflow 的现有 prompt 都是
 * 单 prompt + JSON schema 模式，不需要多轮 messages。
 */
function toOpenAIMessages(
  contents: string | { parts: { text: string }[] }[],
): Array<{ role: 'user' | 'system'; content: string }> {
  if (typeof contents === 'string') {
    return [{ role: 'user', content: contents }];
  }
  // parts[] 形式：把所有 part.text 拼成一条 user message
  const text = contents
    .flatMap((c) => c.parts.map((p) => p.text))
    .join('\n');
  return [{ role: 'user', content: text }];
}

/**
 * 把 OpenAI 风格的 response_format 从我们 Gemini-style config 推导出来。
 *
 * Gemini config 里如果指定了 responseMimeType: 'application/json' + schema，
 * 我们让 DeepSeek 也输出 JSON。DeepSeek 支持 JSON mode 但**不支持
 * 严格的 schema 约束**（OpenAI structured output 的子集）——所以我们
 * 让它输出 JSON 但不传 schema，由调用方自己解析+容错。
 */
function buildResponseFormat(config?: Record<string, any>):
  | { type: 'json_object' }
  | undefined {
  if (config?.responseMimeType === 'application/json') {
    return { type: 'json_object' };
  }
  return undefined;
}

export class DeepSeekProvider implements AIProvider {
  readonly name = 'deepseek';

  constructor(private apiKey: string) {
    if (!apiKey || apiKey.length < 10) {
      throw new Error('[DeepSeekProvider] missing or invalid DEEPSEEK_API_KEY');
    }
  }

  async generate(params: AICallParams): Promise<string> {
    const model = getModelForTask(params.task);
    const messages = toOpenAIMessages(params.contents);
    const response_format = buildResponseFormat(params.config);

    const body: Record<string, any> = {
      model,
      messages,
      // DeepSeek 默认 temperature=1.0，对翻译/语法这种确定性任务太散——
      // 调到 0.3。如果调用方在 config 里显式给了 temperature，尊重它。
      temperature: params.config?.temperature ?? 0.3,
      stream: !!params.onChunk,
    };
    if (response_format) body.response_format = response_format;

    if (params.onChunk) {
      return await this.streamingCall(body, params.onChunk);
    }
    return await this.nonStreamingCall(body);
  }

  private async nonStreamingCall(body: Record<string, any>): Promise<string> {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek ${res.status}: ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new Error(`DeepSeek response missing content: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return text;
  }

  private async streamingCall(
    body: Record<string, any>,
    onChunk: (delta: string) => void,
  ): Promise<string> {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek stream ${res.status}: ${errText.slice(0, 200)}`);
    }
    // OpenAI 风格 SSE：每行 "data: {...}\n\n"，最后 "data: [DONE]"
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;
        try {
          const data = JSON.parse(payload);
          const delta = data?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            onChunk(delta);
            full += delta;
          }
        } catch {
          // 部分块跨行——忽略此行，下次合并。OpenAI SSE 偶发，正常。
        }
      }
    }
    return full;
  }
}
