/**
 * 环境抽象层 — 国内化双轨架构的核心
 *
 * 通过编译时环境变量 VITE_DEPLOYMENT_REGION 决定当前是海外版还是国内版。
 * 所有后续与"用哪个云厂商/哪个 AI 模型/哪个登录方式"有关的代码都
 * 通过这里查询，避免 if (region === 'cn') 散落到处。
 *
 * 使用方式：
 *   import { getRegion, isCN, isGlobal } from '@/src/config/environment';
 *   if (isCN()) { ... }
 *
 * 环境切换：
 *   海外构建：VITE_DEPLOYMENT_REGION=global vite build
 *   国内构建：VITE_DEPLOYMENT_REGION=cn     vite build
 *
 * 默认 = global（保持现版行为不变，避免误打包成国内版）。
 */

export type DeploymentRegion = 'global' | 'cn';

/**
 * 当前部署区域。Vite 在编译时把 import.meta.env.VITE_DEPLOYMENT_REGION
 * 替换成对应字符串。如果未设置，默认 'global'（海外版）。
 */
export function getRegion(): DeploymentRegion {
  const raw = import.meta.env.VITE_DEPLOYMENT_REGION;
  if (raw === 'cn') return 'cn';
  return 'global';
}

/** 国内版？走腾讯云 + DeepSeek + 豆包 + 手机登录 */
export function isCN(): boolean {
  return getRegion() === 'cn';
}

/** 海外版？走 Firebase + Gemini + Google 登录（现版默认） */
export function isGlobal(): boolean {
  return getRegion() === 'global';
}

/**
 * 用于代码里给某段逻辑加 region 守卫。
 * 比如：
 *   assertRegion('cn'); // 这段代码只能跑在国内版
 */
export function assertRegion(expected: DeploymentRegion): void {
  const actual = getRegion();
  if (actual !== expected) {
    throw new Error(
      `Region assertion failed: expected ${expected}, got ${actual}. ` +
      `This code path is not available in the current build.`
    );
  }
}

/**
 * 各组件的"应该用哪家"路由表。新增组件按这个 pattern 加。
 *
 * 看一眼这个 map 就能知道两个版本所有差异点。
 */
export const REGION_CONFIG = {
  global: {
    name: '海外版 (Global)',
    primaryDomain: 'memeflow-16ecf.web.app',
    backend: {
      type: 'firebase' as const,
      hosting: 'firebase',
      functions: 'firebase-cloud-functions-gen2',
      database: 'firestore',
      storage: 'firebase-storage',
      auth: 'firebase-auth',
    },
    ai: {
      // 海外版所有任务用 Gemini
      translate: 'gemini-2.5-flash',
      slang: 'gemini-2.5-flash-lite',
      classroom: 'gemini-2.5-flash-lite',
      classroomNotes: 'gemini-3-pro-preview',
      grammar: 'gemini-2.5-flash',
      chat: 'gemini-2.5-flash',
      provider: 'gemini' as const,
    },
    asr: {
      provider: 'deepgram' as const,
      model: 'nova-3',
    },
    auth: {
      methods: ['google', 'email'] as const,
    },
  },
  cn: {
    name: '国内版 (China)',
    primaryDomain: 'TBD-memeflow-cn.com',
    backend: {
      type: 'tencent' as const,
      hosting: 'tencent-cos-cdn',
      functions: 'tencent-scf',
      database: 'tencent-mongodb',
      storage: 'tencent-cos',
      auth: 'self-built-jwt',
    },
    ai: {
      // 国内版按任务路由：同传用豆包（延迟低），其他用 DeepSeek（综合最强）
      translate: 'deepseek-chat',          // DeepSeek v3
      slang: 'doubao-1.5-pro-32k',         // 豆包（梗百科年轻语料胜出）
      classroom: 'doubao-1.5-pro-32k',     // 豆包（同传延迟最低）
      classroomNotes: 'deepseek-chat',
      grammar: 'deepseek-chat',
      chat: 'deepseek-chat',
      provider: 'multi' as const,
    },
    asr: {
      provider: 'tencent' as const,
      model: 'realtime-asr',
    },
    auth: {
      methods: ['phone-sms', 'wechat'] as const,
    },
  },
} as const;

/** 当前区域的完整配置。React 组件直接调这个查"我该用啥" */
export function getRegionConfig() {
  return REGION_CONFIG[getRegion()];
}
