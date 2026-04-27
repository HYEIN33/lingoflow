import React from 'react';
import { BookOpen, CheckCircle, XCircle, AlertTriangle, MessageSquare } from 'lucide-react';

// Standardized slang contribution guidelines
// Used by: SlangDictionary (add form), SlangOnboarding (step 3), AI validation prompt
export const SLANG_GUIDELINES = {
  zh: {
    title: '词条贡献准则',
    subtitle: '遵循以下标准，让你的词条更容易通过审核',
    rules: [
      {
        icon: '✅',
        title: '含义要求',
        items: [
          '至少 10 个字，用通俗语言解释',
          '说明词的来源（如抖音、微博、游戏等）',
          '区分褒义/贬义/中性用法',
          '如果有多个含义，分别说明',
        ]
      },
      {
        icon: '💬',
        title: '例句要求',
        items: [
          '至少 5 个字，使用真实语境',
          '像日常对话一样自然',
          '不要只是把词重复一遍',
          '可以不填，但会影响质量评分',
        ]
      },
      {
        icon: '🚫',
        title: '不允许',
        items: [
          '广告、推广、无关链接',
          '仇恨言论、歧视性内容',
          '色情、暴力、违法内容',
          '复制粘贴/无意义填充',
        ]
      }
    ],
    qualityTips: '高质量词条 = 详细含义 + 自然例句 + 来源说明。AI 会根据这些标准评分 0–100，70 分以上自动通过，60 以下打回，介于之间的人工复核。',
    examples: {
      good: {
        title: '好的示例',
        term: '显眼包',
        meaning: '指喜欢出风头、爱引人注目的人，通常带有调侃和亲切的意味。源自抖音，最初用来形容那些在公共场合做出夸张行为的人，现在也用于朋友间的玩笑。',
        example: '你看他又在食堂唱歌了，真是个显眼包。',
      },
      bad: {
        title: '差的示例',
        term: '显眼包',
        meaning: '喜欢引人注目',
        example: '显眼包就是显眼包',
      }
    }
  },
  en: {
    title: 'Contribution Guidelines',
    subtitle: 'Follow these standards to get your entry approved',
    rules: [
      {
        icon: '✅',
        title: 'Meaning Requirements',
        items: [
          'At least 10 characters, explained in plain language',
          'Include the origin (e.g., Douyin, Weibo, gaming)',
          'Clarify if positive/negative/neutral',
          'If multiple meanings exist, explain each',
        ]
      },
      {
        icon: '💬',
        title: 'Example Requirements',
        items: [
          'At least 5 characters, use real context',
          'Natural, like daily conversation',
          'Don\'t just repeat the term',
          'Optional, but affects quality score',
        ]
      },
      {
        icon: '🚫',
        title: 'Not Allowed',
        items: [
          'Ads, promotions, irrelevant links',
          'Hate speech, discriminatory content',
          'Pornography, violence, illegal content',
          'Copy-paste / meaningless filler',
        ]
      }
    ],
    qualityTips: 'High-quality entry = detailed meaning + natural example + origin info. AI scores 0-100, auto-approved at 70+.',
    examples: {
      good: {
        title: 'Good Example',
        term: '显眼包',
        meaning: 'A person who loves being the center of attention, usually used as a playful tease. Originated from Douyin, initially describing people who act dramatically in public, now also used as friendly banter.',
        example: '你看他又在食堂唱歌了，真是个显眼包。',
      },
      bad: {
        title: 'Bad Example',
        term: '显眼包',
        meaning: 'Likes attention',
        example: '显眼包 is 显眼包',
      }
    }
  }
};

export function SlangGuidelinesPanel({ uiLang, compact = false }: { uiLang: 'en' | 'zh', compact?: boolean }) {
  const g = SLANG_GUIDELINES[uiLang];

  if (compact) {
    return (
      <div className="bg-[rgba(91,127,232,0.06)] border border-[var(--border-solid)] border-l-[3px] border-l-[var(--blue-accent)] rounded-xl p-[18px_22px] space-y-2">
        <h4 className="font-display italic text-[14px] font-semibold text-[var(--ink-body)] flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[var(--blue-accent)]" />
          — {g.title}
        </h4>
        <ul className="font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-body)] list-disc pl-[18px]">
          {g.rules[0].items.slice(0, 2).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
        <p className="font-zh-serif text-[11px] text-[var(--ink-muted)]">{g.qualityTips}</p>
      </div>
    );
  }

  return (
    <div className="glass-thick rounded-[28px] p-6 space-y-6">
      <div className="text-center pb-4 border-b border-[var(--ink-hairline)]">
        <h3 className="font-display font-bold text-[22px] text-[var(--ink)] tracking-[-0.02em] flex items-center justify-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-[var(--blue-accent)]" />
          {(() => {
            const title = g.title;
            // Highlight "贡献准则" (zh) or "Guidelines" (en) with italic blue em
            const zhKeyword = '贡献准则';
            const enKeyword = 'Guidelines';
            if (title.includes(zhKeyword)) {
              const [pre, post] = title.split(zhKeyword);
              return <>{pre}<em className="italic text-[var(--blue-accent)] font-medium">{zhKeyword}</em>{post}</>;
            }
            if (title.includes(enKeyword)) {
              const [pre, post] = title.split(enKeyword);
              return <>{pre}<em className="italic text-[var(--blue-accent)] font-medium">{enKeyword}</em>{post}</>;
            }
            return title;
          })()}
        </h3>
        <p className="font-zh-sans text-[13px] font-medium text-[var(--ink-body)]">{g.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {g.rules.map((rule, i) => {
          const variantClass =
            i === 0
              ? 'bg-[rgba(47,99,23,0.05)] border-[rgba(47,99,23,0.25)]'
              : i === 1
                ? 'bg-[rgba(91,127,232,0.05)] border-[rgba(91,127,232,0.25)]'
                : 'bg-[rgba(229,56,43,0.05)] border-[rgba(229,56,43,0.25)]';
          const iconBg =
            i === 0
              ? 'bg-[rgba(47,99,23,0.15)] text-[var(--green-ok)]'
              : i === 1
                ? 'bg-[rgba(91,127,232,0.15)] text-[var(--blue-accent)]'
                : 'bg-[rgba(229,56,43,0.15)] text-[var(--red-warn)]';
          return (
            <div key={i} className={`rounded-[16px] p-[20px_22px] border ${variantClass}`}>
              <div
                className={`w-[38px] h-[38px] rounded-[11px] inline-flex items-center justify-center mb-[10px] ${iconBg}`}
              >
                {i === 0 ? (
                  <CheckCircle className="w-[18px] h-[18px]" strokeWidth={2} />
                ) : i === 1 ? (
                  <MessageSquare className="w-[18px] h-[18px]" strokeWidth={2} />
                ) : (
                  <XCircle className="w-[18px] h-[18px]" strokeWidth={2} />
                )}
              </div>
              <h4 className="font-display font-bold text-[16px] tracking-[-0.02em] text-[var(--ink)] mb-[10px]">
                {rule.title}
              </h4>
              <ul className="font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-body)] list-disc pl-[18px] space-y-0">
                {rule.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Good vs Bad example */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-[rgba(47,99,23,0.06)] border-2 border-[rgba(47,99,23,0.3)] rounded-[16px] p-[18px_20px]">
          <span className="inline-flex items-center gap-[5px] px-[10px] py-[3px] rounded-full font-mono-meta text-[10px] font-extrabold tracking-[0.12em] uppercase bg-[rgba(47,99,23,0.15)] text-[var(--green-ok)] mb-3">
            <CheckCircle className="w-3 h-3" strokeWidth={2.5} />
            {g.examples.good.title}
            <span className="opacity-75">· AI 94</span>
          </span>
          <h4 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-[10px]">
            {g.examples.good.term}
          </h4>
          <p className="font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-body)] mb-2">
            <span className="font-bold text-[var(--ink)]">{uiLang === 'zh' ? '含义：' : 'Meaning: '}</span>
            {g.examples.good.meaning}
          </p>
          <p className="font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-body)]">
            <span className="font-bold text-[var(--ink)]">{uiLang === 'zh' ? '例句：' : 'Example: '}</span>
            {g.examples.good.example}
          </p>
        </div>
        <div className="bg-[rgba(229,56,43,0.06)] border-2 border-[rgba(229,56,43,0.3)] rounded-[16px] p-[18px_20px]">
          <span className="inline-flex items-center gap-[5px] px-[10px] py-[3px] rounded-full font-mono-meta text-[10px] font-extrabold tracking-[0.12em] uppercase bg-[rgba(229,56,43,0.15)] text-[var(--red-warn)] mb-3">
            <XCircle className="w-3 h-3" strokeWidth={2.5} />
            {g.examples.bad.title}
            <span className="opacity-75">· AI 32</span>
          </span>
          <h4 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-[10px]">
            {g.examples.bad.term}
          </h4>
          <p className="font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-subtle)] mb-2">
            <span className="font-bold text-[var(--ink)]">{uiLang === 'zh' ? '含义：' : 'Meaning: '}</span>
            {g.examples.bad.meaning}
          </p>
          <p className="font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-subtle)]">
            <span className="font-bold text-[var(--ink)]">{uiLang === 'zh' ? '例句：' : 'Example: '}</span>
            {g.examples.bad.example}
          </p>
          <div className="mt-3 pt-3 border-t border-dashed border-[rgba(229,56,43,0.25)]">
            <div className="font-mono-meta text-[10px] tracking-[0.18em] uppercase text-[var(--red-warn)] mb-1.5 font-bold">
              AI {uiLang === 'zh' ? '反馈' : 'feedback'}
            </div>
            <p className="m-0 font-zh-serif text-[12.5px] leading-[1.75] text-[var(--red-warn)] opacity-85">
              {uiLang === 'zh' ? '含义过短、没说明来源和使用语境，缺少褒贬色彩；例句未体现梗的情绪。' : 'Meaning too short, no context/origin, no tone description; example lacks emotional valence.'}
            </p>
          </div>
        </div>
      </div>

      <div className="border-[1.5px] border-[rgba(91,127,232,0.3)] bg-[rgba(91,127,232,0.06)] rounded-[14px] p-[16px_20px]">
        <p className="font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-body)] m-0 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-[var(--blue-accent)] shrink-0 mt-0.5" />
          <span>{g.qualityTips}</span>
        </p>
      </div>
    </div>
  );
}
