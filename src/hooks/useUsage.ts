/**
 * 用量 hook — 读 _rate_limits/{uid} 文档，按 24h 滑窗算各 bucket 用量。
 *
 * 数据来源：functions/index.js 里 hydrateIfNeeded 把 memCounters 每 10s
 * flush 一次到 _rate_limits/{uid}.buckets[name] = [Timestamp...]，每个
 * 时间戳代表用户的一次 API 调用。我们这里读出来 + 按当下 24h 窗口过滤
 * 就得到"今日用量"。
 *
 * 注意：
 * 1. 数据有最多 10s 延迟（flush 间隔），用户刚发起的调用未必立刻反映
 * 2. 函数实例切换时 memCounters 重置，可能短暂少计——可接受
 * 3. firestore.rules 已允许 isOwner(uid) 读自己的 _rate_limits 文档
 */

import { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';

/** memeflow 跟踪的所有限流桶，跟 functions/index.js 里 BUCKETS 同步 */
export type BucketName = 'translate' | 'classroom' | 'grammar' | 'chat' | 'slang' | 'live-token';

/** 每个桶的限额配置（必须跟 functions/index.js BUCKETS 保持同步） */
export const BUCKET_LIMITS: Record<BucketName, { perMinute: { free: number; pro: number }; perDay: { free: number; pro: number } }> = {
  translate:   { perMinute: { free: 40, pro: 150 }, perDay: { free: 500, pro: 3000 } },
  classroom:   { perMinute: { free: 80, pro: 300 }, perDay: { free: 1000, pro: 6000 } },
  grammar:     { perMinute: { free: 30, pro: 100 }, perDay: { free: 400, pro: 2500 } },
  chat:        { perMinute: { free: 40, pro: 150 }, perDay: { free: 500, pro: 3000 } },
  slang:       { perMinute: { free: 80, pro: 250 }, perDay: { free: 800, pro: 4000 } },
  'live-token': { perMinute: { free: 15, pro: 20 }, perDay: { free: Infinity, pro: Infinity } },
};

export interface BucketUsage {
  bucket: BucketName;
  /** 24h 窗口内的调用次数 */
  usedDay: number;
  /** 1 分钟窗口内的调用次数 */
  usedMinute: number;
  /** 当前账户类型对应的日上限 */
  capDay: number;
  /** 当前账户类型对应的分钟上限 */
  capMinute: number;
  /** 0-1 的剩余比例（越接近 1 越接近撞限） */
  pctDay: number;
  pctMinute: number;
}

/** 主 hook：返回当前用户所有 bucket 的用量 */
export function useUsage(isPro: boolean = false): {
  loading: boolean;
  byBucket: Partial<Record<BucketName, BucketUsage>>;
  /** 整体最高使用率（用于全局徽章颜色） */
  worstPctDay: number;
} {
  const [loading, setLoading] = useState(true);
  const [rawBuckets, setRawBuckets] = useState<Record<string, number[]>>({});

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }
    const ref = doc(db, '_rate_limits', user.uid);
    // onSnapshot 实时跟踪——后端每 10s flush 一次后前端立即看到新数据
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setRawBuckets({});
          setLoading(false);
          return;
        }
        const data = snap.data() as { buckets?: Record<string, Timestamp[]> };
        const out: Record<string, number[]> = {};
        if (data.buckets) {
          for (const [name, ts] of Object.entries(data.buckets)) {
            if (Array.isArray(ts)) {
              out[name] = ts.map((t) => (typeof t?.toMillis === 'function' ? t.toMillis() : 0));
            }
          }
        }
        setRawBuckets(out);
        setLoading(false);
      },
      (err) => {
        console.warn('[useUsage] _rate_limits subscribe failed:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const now = Date.now();
  const dayAgoMs = now - 86_400_000;
  const minuteAgoMs = now - 60_000;

  const byBucket: Partial<Record<BucketName, BucketUsage>> = {};
  let worstPctDay = 0;

  for (const bucket of Object.keys(BUCKET_LIMITS) as BucketName[]) {
    const limits = BUCKET_LIMITS[bucket];
    const capDay = isPro ? limits.perDay.pro : limits.perDay.free;
    const capMinute = isPro ? limits.perMinute.pro : limits.perMinute.free;
    const tsList = rawBuckets[bucket] || [];
    const usedDay = tsList.filter((t) => t > dayAgoMs).length;
    const usedMinute = tsList.filter((t) => t > minuteAgoMs).length;
    const pctDay = capDay === Infinity ? 0 : Math.min(1, usedDay / capDay);
    const pctMinute = capMinute === Infinity ? 0 : Math.min(1, usedMinute / capMinute);
    byBucket[bucket] = { bucket, usedDay, usedMinute, capDay, capMinute, pctDay, pctMinute };
    if (pctDay > worstPctDay) worstPctDay = pctDay;
  }

  return { loading, byBucket, worstPctDay };
}

/** 把 bucket 名映射成中文友好标签——用于 UI 显示 */
export const BUCKET_LABELS_ZH: Record<BucketName, string> = {
  translate: '翻译',
  classroom: '课堂同传',
  grammar: '语法检查',
  chat: 'AI 问答',
  slang: '梗百科',
  'live-token': '同传连接',
};
export const BUCKET_LABELS_EN: Record<BucketName, string> = {
  translate: 'Translate',
  classroom: 'Classroom',
  grammar: 'Grammar',
  chat: 'AI Chat',
  slang: 'Slang',
  'live-token': 'Live Token',
};
