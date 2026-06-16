/**
 * BlurText — 文字从「模糊 + 偏移」逐字/逐词淡入到「清晰归位」。
 *
 * 这是基于 React Bits BlurText 的概念，用本项目已验证可靠的 motion
 * （Framer Motion v12，全站 11 个组件在用）重写的干净版本。
 *
 * 为什么不直接用 React Bits 原版：原版用 buildKeyframes 多段 keyframes +
 * times 数组 + 自定义函数 ease（默认 (t)=>t），在本项目的 motion v12 +
 * Vite 多入口环境下动画静默不播 —— 实测元素永远停在 initial 态
 * blur(10px)+opacity:0，答案文字根本看不见。改用 motion 最标准的
 * 容器 stagger + 子项 initial/animate 两态，行为可预测、必定播放、必定归位。
 *
 * 用法（复习卡答案区）：给组件加 key（绑定卡片 id + 答案显示状态），
 * 每次「翻看答案 / 切下一张卡」key 变 → 重新挂载 → 重播模糊显影。
 */
import { motion, type Variants, type Transition } from 'motion/react';

export type BlurTextProps = {
  text?: string;
  /** 逐词还是逐字。中文建议 'letters'，英文建议 'words'。 */
  animateBy?: 'words' | 'letters';
  /** 入场方向：从上方还是下方滑入。 */
  direction?: 'top' | 'bottom';
  /** 每个片段之间的间隔（毫秒），越大越像打字机。 */
  delay?: number;
  /** 单个片段动画时长（秒）。 */
  stepDuration?: number;
  /** 全部播完的回调。 */
  onAnimationComplete?: () => void;
  className?: string;
};

const BlurText: React.FC<BlurTextProps> = ({
  text = '',
  animateBy = 'words',
  direction = 'top',
  delay = 60,
  stepDuration = 0.4,
  onAnimationComplete,
  className = ''
}) => {
  const segments = animateBy === 'words' ? text.split(' ') : Array.from(text);
  const yFrom = direction === 'top' ? -16 : 16;

  // 容器用 staggerChildren 驱动逐个片段依次入场 —— motion 最可靠的 stagger 写法。
  const container: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: delay / 1000 }
    }
  };

  const itemTransition: Transition = { duration: stepDuration, ease: 'easeOut' };
  const item: Variants = {
    hidden: { filter: 'blur(10px)', opacity: 0, y: yFrom },
    visible: { filter: 'blur(0px)', opacity: 1, y: 0, transition: itemTransition }
  };

  return (
    <motion.p
      className={`blur-text ${className} inline-flex flex-wrap`}
      variants={container}
      initial="hidden"
      animate="visible"
      onAnimationComplete={onAnimationComplete}
    >
      {segments.map((seg, i) => (
        <motion.span
          key={i}
          variants={item}
          style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
        >
          {seg === ' ' ? ' ' : seg}
          {animateBy === 'words' && i < segments.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </motion.p>
  );
};

export default BlurText;
