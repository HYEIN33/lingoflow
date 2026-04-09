import { GoogleGenAI, Type, Modality } from "@google/genai";

export type AIProvider = 'gemini';

function getGeminiAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing.");
  }
  
  return new GoogleGenAI({ apiKey });
}

export interface Example {
  sentence: string;
  translation: string;
}

export interface UsageDefinition {
  label: string;
  labelZh: string;
  meaning: string;
  meaningZh: string;
  examples: Example[];
  synonyms?: string[];
  alternatives?: string[];
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
  const ai = getGeminiAI();
  const response = await ai.models.generateContent({
    model: model,
    contents: `Explain the following Chinese internet slang or meme. Provide its meaning, origin (e.g., Douyin, Weibo, gaming), usage context, and examples.
    
    Slang: "${text}"`,
    config: {
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
    }
  });
  return JSON.parse(response.text);
}

export async function translateText(text: string, formalityLevel?: number): Promise<TranslationResult> {
  const { model } = getEffectiveConfig();
  
  const ai = getGeminiAI();
  
  let formalityPrompt = "";
  if (formalityLevel !== undefined) {
    formalityPrompt = `\nThe user has requested a specific formality level of ${formalityLevel} (1 = very casual/slang, 100 = highly academic/formal). Please ensure the 'authenticTranslation' reflects this exact formality level.`;
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: `Analyze the following text between Chinese and English. 
    
    1. Provide an 'Authentic Translation' (地道表达) that sounds natural to native speakers.
    2. Provide an 'Academic Translation' (学术表达) that is formal and suitable for academic or professional contexts.
    3. If the 'Authentic Translation' or the original text contains any slang or idioms, list them in 'slangTerms'.
    4. Provide multiple usage definitions categorized by frequency (e.g., "Primary", "Secondary", "Slang/Informal").
    
    For each usage:
    1. Provide a label (e.g., "Most Common").
    2. Provide the meaning in English and Chinese.
    3. Provide 2-3 example sentences with translations specific to this usage.
    4. Provide a list of synonyms and alternative translations.
    ${formalityPrompt}
    
    Text: "${text}"`,
    config: {
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
                alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
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
    }
  });
  return JSON.parse(response.text);
}

export async function checkGrammar(text: string): Promise<GrammarCheckResult> {
  const { model } = getEffectiveConfig();
  
  const ai = getGeminiAI();
  const response = await ai.models.generateContent({
    model: model,
    contents: `Check the grammar of the following text. If there are errors, provide the corrected version and a detailed explanation in both English and Chinese. If there are no errors, set hasErrors to false.
    
    Additionally, perform a 'Style Detection' (风格检测). If the text is too colloquial or informal, provide 'styleFeedback' (e.g., "你写的这句话偏口语，如果是正式场合建议改成…") and provide an 'academicSuggestion'.
    
    Also, provide an array of specific 'edits', where each edit shows the 'originalText' that was wrong, the 'correctedText', and a brief 'explanation' (in Chinese) of why it was changed.
    
    Text: "${text}"`,
    config: {
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
    }
  });
  return JSON.parse(response.text);
}

export async function translateSimple(text: string): Promise<string> {
  const { model } = getEffectiveConfig();
  
  const ai = getGeminiAI();
  const response = await ai.models.generateContent({
    model: model,
    contents: `You are a professional interpreter. Translate the following text between Chinese and English. 
    If the input is Chinese, translate to English. 
    If the input is English, translate to Chinese.
    Only return the translated text, no other explanation.
    
    Text: "${text}"`,
  });
  return response.text.trim();
}

export async function generateSpeech(text: string, voiceName: string = 'Kore'): Promise<string | undefined> {
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
  const ai = getGeminiAI();
  
  const response = await ai.models.generateContent({
    model: model,
    contents: `You are a content moderator and quality assessor for a Chinese internet slang dictionary. 
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
    
    Return a JSON object with 'isValid' (boolean, true only if violationLevel is NONE), 'reason' (string explaining why if rejected, or empty if valid), 'qualityScore' (number), and 'violationLevel' (string).`,
    config: {
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
    }
  });
  
  return JSON.parse(response.text);
}

export async function generateSlangExample(term: string, meaning: string): Promise<string> {
  const { model } = getEffectiveConfig();
  const ai = getGeminiAI();
  
  const response = await ai.models.generateContent({
    model: model,
    contents: `Generate a natural, colloquial example sentence using the following Chinese internet slang term, based on its meaning. 
    The example should be something a native speaker would actually say online or in daily conversation.
    Only output the sentence itself, nothing else.
    
    Term: "${term}"
    Meaning: "${meaning}"`,
  });
  
  return response.text.trim();
}
