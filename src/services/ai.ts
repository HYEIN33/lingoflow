import { GoogleGenAI, Type, Modality } from "@google/genai";

export type AIProvider = 'gemini';

// Simple client-side rate limiter
const rateLimiter = {
  calls: [] as number[],
  maxPerMinute: 5,
  check(): boolean {
    const now = Date.now();
    this.calls = this.calls.filter(t => now - t < 60000);
    if (this.calls.length >= this.maxPerMinute) return false;
    this.calls.push(now);
    return true;
  }
};

/**
 * Whether to use the server-side API proxy.
 * When the API key is not bundled (empty string), requests go through /api/generate
 * which keeps the key on the server side.
 */
const USE_PROXY = !process.env.GEMINI_API_KEY;

function getGeminiAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Start the proxy with `npm run dev:api`.");
  }

  return new GoogleGenAI({ apiKey });
}

/**
 * Call the Gemini API through the server-side proxy.
 * The proxy holds the API key so it never reaches the browser.
 */
async function callGeminiProxy(
  model: string,
  contents: string | object[],
  config?: Record<string, any>,
): Promise<any> {
  const body: Record<string, any> = {
    model,
    contents: typeof contents === 'string'
      ? [{ parts: [{ text: contents }] }]
      : contents,
  };
  if (config) body.config = config;

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Proxy error: ${res.status}`);
  }

  const data = await res.json();

  // Normalize: the raw Gemini REST API returns candidates[].content.parts[].text
  // while the SDK returns a convenience .text property. Extract text for callers.
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return { text, raw: data };
}

/**
 * Unified generate helper — routes through proxy or SDK depending on config.
 */
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function geminiGenerate(opts: {
  model: string;
  contents: string | { parts: { text: string }[] }[];
  config?: Record<string, any>;
}): Promise<string> {
  const models = [opts.model, ...FALLBACK_MODELS.filter(m => m !== opts.model)];

  for (let i = 0; i < models.length; i++) {
    try {
      if (USE_PROXY) {
        const result = await callGeminiProxy(models[i], opts.contents, opts.config);
        return result.text;
      }
      const ai = getGeminiAI();
      const response = await ai.models.generateContent({
        model: models[i],
        contents: opts.contents as any,
        config: opts.config as any,
      });
      return response.text;
    } catch (e: any) {
      const msg = e?.message || String(e);
      const status = e?.status || msg.match(/(\d{3})/)?.[1];

      // Location restriction or FAILED_PRECONDITION — try proxy fallback
      if (msg.includes('location is not supported') || msg.includes('FAILED_PRECONDITION') || status == 400) {
        console.warn(`Direct API blocked (${msg.substring(0, 80)}), trying proxy...`);
        try {
          const result = await callGeminiProxy(models[i], opts.contents, opts.config);
          return result.text;
        } catch (proxyErr: any) {
          // Proxy also failed — throw user-friendly error
          throw new Error('翻译服务暂时不可用，请稍后重试');
        }
      }

      if ((status == 503 || status == 429) && i < models.length - 1) {
        console.warn(`${models[i]} unavailable (${status}), falling back to ${models[i + 1]}`);
        continue;
      }

      // Friendly error messages
      if (status == 503 || status == 429) {
        throw new Error('AI 服务繁忙，请稍后重试');
      }
      throw new Error('翻译失败，请检查网络后重试');
    }
  }
  throw new Error('AI 服务暂时不可用，请稍后重试');
}

export interface Example {
  sentence: string;
  translation: string;
}

export interface Conjugations {
  pastTense?: string;
  pastParticiple?: string;
  presentParticiple?: string;
  presentPerfect?: string;
  thirdPerson?: string;
  plural?: string;
  comparative?: string;
  superlative?: string;
}

export interface UsageDefinition {
  label: string;
  labelZh: string;
  meaning: string;
  meaningZh: string;
  examples: Example[];
  synonyms?: string[];
  antonyms?: string[];
  alternatives?: string[];
  conjugations?: Conjugations;
}

export interface TranslationResult {
  original: string;
  pronunciation?: string;
  authenticTranslation?: string;
  academicTranslation?: string;
  slangTerms?: string[];
  usages: UsageDefinition[];
}

export interface GrammarEdit {
  originalText: string;
  correctedText: string;
  explanation: string;
}

export interface GrammarCheckResult {
  original: string;
  corrected: string;
  explanation: string;
  explanationZh: string;
  hasErrors: boolean;
  styleFeedback?: string;
  academicSuggestion?: string;
  edits?: GrammarEdit[];
}

export interface SlangExplanationResult {
  term: string;
  meaning: string;
  meaningEn: string;
  origin: string;
  usage: string;
  examples: Example[];
  relatedTerms?: string[];
}

function getEffectiveConfig(): { provider: AIProvider, model: string } {
  return { 
    provider: 'gemini', 
    model: 'gemini-2.5-flash' 
  };
}

export async function explainSlang(text: string): Promise<SlangExplanationResult> {
  const { model } = getEffectiveConfig();
  const contents = `Explain the following Chinese internet slang or meme. Provide its meaning, origin (e.g., Douyin, Weibo, gaming), usage context, and examples.

    Slang: "${text}"`;
  const config = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        term: { type: Type.STRING },
        meaning: { type: Type.STRING, description: "Meaning in Chinese" },
        meaningEn: { type: Type.STRING, description: "Meaning in English" },
        origin: { type: Type.STRING, description: "Origin of the slang (Chinese)" },
        usage: { type: Type.STRING, description: "How to use it (Chinese)" },
        relatedTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
        examples: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sentence: { type: Type.STRING },
              translation: { type: Type.STRING }
            },
            required: ["sentence", "translation"]
          }
        }
      },
      required: ["term", "meaning", "meaningEn", "origin", "usage", "examples"]
    }
  };
  const text_ = await geminiGenerate({ model, contents, config });
  return JSON.parse(text_);
}

export async function translateText(text: string, formalityLevel?: number): Promise<TranslationResult> {
  const { model } = getEffectiveConfig();

  let formalityPrompt = "";
  if (formalityLevel !== undefined) {
    formalityPrompt = `\nThe user has requested a specific formality level of ${formalityLevel} (1 = very casual/slang, 100 = highly academic/formal). Please ensure the 'authenticTranslation' reflects this exact formality level.`;
  }

  const contents = `Analyze the following text between Chinese and English.

    1. Provide an 'Authentic Translation' (地道表达) that sounds natural to native speakers.
    2. Provide an 'Academic Translation' (学术表达) that is formal and suitable for academic or professional contexts.
    3. If the 'Authentic Translation' or the original text contains any slang or idioms, list them in 'slangTerms'.
    4. Provide multiple usage definitions categorized by frequency (e.g., "Primary", "Secondary", "Slang/Informal").

    For each usage:
    1. Provide a label (e.g., "Most Common").
    2. Provide the meaning in English and Chinese.
    3. Provide 2-3 example sentences with translations specific to this usage.
    4. Provide a list of synonyms, antonyms, and alternative translations.
    5. If the word is a verb, provide conjugations (past tense, past participle, present participle, present perfect example, third person singular) in 'conjugations'. For present perfect, provide a short example like "have/has + past participle". If the past tense and past participle are the same word, combine them into one entry labeled "Past Tense / Past Participle".
    6. If the word is a noun, provide plural form in 'conjugations'.
    7. If the word is an adjective, provide comparative and superlative in 'conjugations'.
    ${formalityPrompt}

    Text: "${text}"`;
  const config = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        original: { type: Type.STRING },
        pronunciation: { type: Type.STRING },
        authenticTranslation: { type: Type.STRING, description: "Natural, native-like translation" },
        academicTranslation: { type: Type.STRING, description: "Formal, academic translation" },
        slangTerms: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of slang terms used" },
        usages: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, description: "Frequency label like 'Primary Usage'" },
              labelZh: { type: Type.STRING, description: "Chinese translation of the label" },
              meaning: { type: Type.STRING },
              meaningZh: { type: Type.STRING },
              synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
              antonyms: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of antonyms" },
              alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
              conjugations: { type: Type.OBJECT, description: "Verb tenses, noun plurals, or adjective forms", properties: {
                pastTense: { type: Type.STRING },
                pastParticiple: { type: Type.STRING },
                presentParticiple: { type: Type.STRING },
                presentPerfect: { type: Type.STRING, description: "Present perfect form, e.g. 'have/has gone'" },
                thirdPerson: { type: Type.STRING },
                plural: { type: Type.STRING },
                comparative: { type: Type.STRING },
                superlative: { type: Type.STRING }
              }},
              examples: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sentence: { type: Type.STRING },
                    translation: { type: Type.STRING }
                  },
                  required: ["sentence", "translation"]
                }
              }
            },
            required: ["label", "labelZh", "meaning", "meaningZh", "examples"]
          }
        }
      },
      required: ["original", "usages"]
    }
  };
  const text_ = await geminiGenerate({ model, contents, config });
  return JSON.parse(text_);
}

export async function checkGrammar(text: string): Promise<GrammarCheckResult> {
  const { model } = getEffectiveConfig();

  const contents = `Check the grammar of the following text. If there are errors, provide the corrected version and a detailed explanation in both English and Chinese. If there are no errors, set hasErrors to false.

    Additionally, perform a 'Style Detection' (风格检测). If the text is too colloquial or informal, provide 'styleFeedback' (e.g., "你写的这句话偏口语，如果是正式场合建议改成…") and provide an 'academicSuggestion'.

    Also, provide an array of specific 'edits', where each edit shows the 'originalText' that was wrong, the 'correctedText', and a brief 'explanation' (in Chinese) of why it was changed.

    Text: "${text}"`;
  const config = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        original: { type: Type.STRING },
        corrected: { type: Type.STRING },
        explanation: { type: Type.STRING, description: "Explanation of errors in English" },
        explanationZh: { type: Type.STRING, description: "Explanation of errors in Chinese" },
        hasErrors: { type: Type.BOOLEAN },
        styleFeedback: { type: Type.STRING, description: "Feedback on the style/formality of the text in Chinese" },
        academicSuggestion: { type: Type.STRING, description: "A more formal or academic version of the text" },
        edits: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              originalText: { type: Type.STRING },
              correctedText: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["originalText", "correctedText", "explanation"]
          }
        }
      },
      required: ["original", "corrected", "explanation", "explanationZh", "hasErrors"]
    }
  };
  const text_ = await geminiGenerate({ model, contents, config });
  return JSON.parse(text_);
}

export async function extractTextFromImage(base64Image: string, mimeType: string): Promise<string> {
  const { model } = getEffectiveConfig();

  const contents = [
    {
      parts: [
        { text: 'Extract ALL text from this image. Return only the extracted text, nothing else. If multiple languages are present, include all of them. If no text is found, return "NO_TEXT".' },
        { inlineData: { mimeType, data: base64Image } }
      ]
    }
  ];

  if (USE_PROXY) {
    const result = await callGeminiProxy(model, contents);
    return result.text?.trim() || '';
  }

  const ai = getGeminiAI();
  const response = await ai.models.generateContent({
    model,
    contents: contents as any,
  });
  return response.text?.trim() || '';
}

export async function translateSimple(text: string): Promise<string> {
  const { model } = getEffectiveConfig();

  const contents = `You are a professional interpreter. Translate the following text between Chinese and English.
    If the input is Chinese, translate to English.
    If the input is English, translate to Chinese.
    Only return the translated text, no other explanation.

    Text: "${text}"`;
  const result = await geminiGenerate({ model, contents });
  return result.trim();
}

export async function getReviewHint(word: string, meaningZh: string): Promise<string> {
  const { model } = getEffectiveConfig();

  const contents = `你是一个英语记忆助手。用户正在复习单词，请帮助他们记住这个词。

单词: "${word}"
中文含义: "${meaningZh}"

请用中文给出:
1. 一个记忆技巧（谐音、联想、词根拆解等，选最有效的一种）
2. 一个容易混淆的词及区别（如果有）
3. 一个简短的使用场景

要求：简洁，每条不超过一行，总共不超过3行。不要标号。`;

  const result = await geminiGenerate({ model, contents });
  return result.trim();
}

export async function aiChat(messages: { role: 'user' | 'ai'; text: string }[]): Promise<string> {
  const { model } = getEffectiveConfig();

  const systemPrompt = `You are MemeFlow AI Assistant, a friendly and knowledgeable language learning companion. You help users with:
- English/Chinese translation questions
- Grammar explanations
- Vocabulary building tips
- Internet slang and meme culture
- Pronunciation guidance
- Language learning strategies

Always respond in the same language the user uses. If they write in Chinese, respond in Chinese. If English, respond in English.
Keep answers concise, practical, and encouraging. Use examples when helpful.`;

  const chatHistory = messages.map(m => ({
    parts: [{ text: m.text }],
    role: m.role === 'user' ? 'user' : 'model'
  }));

  const contents = [
    { parts: [{ text: systemPrompt }], role: 'user' },
    { parts: [{ text: '好的，我是 MemeFlow AI 助手，随时为你解答语言学习相关的问题！' }], role: 'model' },
    ...chatHistory
  ];

  const result = await geminiGenerate({ model, contents });
  return result.trim();
}

// Speech generation requires the SDK (audio modality not supported through the proxy).
// This will only work when the API key is bundled or when running in AI Studio.
export async function generateSpeech(text: string, voiceName: string = 'Kore'): Promise<string | undefined> {
  if (USE_PROXY) {
    throw new Error('Speech generation is not available through the API proxy. Run with a bundled API key or use AI Studio.');
  }
  const ai = getGeminiAI();
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  const prompt = hasChinese 
    ? `Read this naturally in Chinese: ${text}`
    : `Read this naturally in English: ${text}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}

export interface SlangValidationResult {
  isValid: boolean;
  reason: string;
  qualityScore: number;
  violationLevel: 'L1' | 'V1' | 'V2' | 'V3' | 'NONE';
}

export async function validateSlangMeaning(term: string, meaning: string, example: string): Promise<SlangValidationResult> {
  const { model } = getEffectiveConfig();

  const contents = `You are a content moderator and quality assessor for a Chinese internet slang dictionary.
    Review the following slang meaning submission.

    Term: "${term}"
    Meaning: "${meaning}"
    Example: "${example}"

    Assess the submission based on the following criteria:
    1. Quality Score (0-100): How accurate, detailed, and helpful is the explanation and example?
    2. Violation Level:
       - 'NONE': Valid and acceptable content.
       - 'L1' (Low Quality): Content is pure copy-paste, gibberish, or the meaning is too brief to be helpful.
       - 'V1' (Minor Violation): Irrelevant to the term, soft advertising/spam.
       - 'V2' (Severe Violation): Hate speech, discrimination, pornography, malicious spam.
       - 'V3' (Extreme Violation): Illegal content, extreme violence, severe harm.

    Important Rules:
    - If the Example is empty (""), it is ACCEPTABLE. Do NOT flag it as 'L1' just because the example is missing. However, the Quality Score should be lower (e.g., max 70) because it lacks an example.
    - If the submission is rejected (violationLevel != 'NONE'), the 'reason' MUST clearly explain to the user exactly why it is non-compliant in Chinese (e.g., "内容包含广告信息", "含义解释过于简短，请补充更多细节"). Do not just say "error".

    Return a JSON object with 'isValid' (boolean, true only if violationLevel is NONE), 'reason' (string explaining why if rejected, or empty if valid), 'qualityScore' (number), and 'violationLevel' (string).`;
  const config = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        isValid: { type: Type.BOOLEAN },
        reason: { type: Type.STRING },
        qualityScore: { type: Type.INTEGER },
        violationLevel: { type: Type.STRING }
      },
      required: ["isValid", "reason", "qualityScore", "violationLevel"]
    }
  };
  const text = await geminiGenerate({ model, contents, config });
  return JSON.parse(text);
}

export async function suggestSlangMeaning(term: string, partialInput: string): Promise<string> {
  if (!rateLimiter.check()) {
    throw new Error('Rate limit exceeded. Please wait a moment.');
  }
  const { model } = getEffectiveConfig();

  const contents = `You are helping a user write a definition for the Chinese internet slang term "${term}".
    The user has started typing: "${partialInput}"

    Complete or expand their input into a full, natural definition (in Chinese).
    Keep it concise (1-2 sentences), accurate, and in the same tone as the user's input.
    Only output the suggested definition text, nothing else.`;
  const result = await geminiGenerate({ model, contents });
  return result.trim();
}

export async function generateSlangExample(term: string, meaning: string): Promise<string> {
  const { model } = getEffectiveConfig();

  const contents = `Generate a natural, colloquial example sentence using the following Chinese internet slang term, based on its meaning.
    The example should be something a native speaker would actually say online or in daily conversation.
    Only output the sentence itself, nothing else.

    Term: "${term}"
    Meaning: "${meaning}"`;
  const result = await geminiGenerate({ model, contents });
  return result.trim();
}
