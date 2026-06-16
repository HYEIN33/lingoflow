/**
 * 动效令牌 — 全站动画的统一度量衡（与 src/index.css 的 CSS 变量同源）。
 *
 * 为什么存在：之前时长/缓动散落在各组件里（0.15s~0.7s 八九种），
 * 动画越加越多手感越杂。工业级 app 全站只用一小套节奏：
 *   fast  微反馈（颜色/透明度/按压）
 *   base  常规过渡
 *   emph  页面切换、内容入场等强调动作
 *   hero  一次性的开场大动作（如 Tab 栏入场），慎用
 *
 * 新写的 motion / GSAP 动画一律 import 这里的常量，不再写裸数字。
 */

/** 时长（秒，motion / GSAP 通用） */
export const DUR = {
  fast: 0.15,
  base: 0.25,
  emph: 0.35,
  hero: 0.7,
} as const;

/** 标准缓动 — motion 数组形式（等价 CSS cubic-bezier(0.22,1,0.36,1)） */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** GSAP 用的同手感命名缓动 */
export const GSAP_EASE_OUT = 'power3.out';
export const GSAP_EASE_BACK = 'back.out(1.6)';

/**
 * 系统是否开了"减少动态效果"。
 * motion 由 main.tsx 的 MotionConfig reducedMotion="user" 自动处理；
 * GSAP 不认这个设置，所以 GSAP 动画前必须手动用它守卫。
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
