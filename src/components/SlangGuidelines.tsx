import React from 'react';
import { BookOpen, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

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
        title: '不允许的内容',
        items: [
          '广告、推广、无关链接',
          '仇恨言论、歧视性内容',
          '色情、暴力、违法内容',
          '复制粘贴/无意义填充',
        ]
      }
    ],
    qualityTips: '高质量词条 = 详细含义 + 自然例句 + 来源说明。AI 会根据这些标准评分 (0-100)，70 分以上自动通过。',
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
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
        <h4 className="text-sm font-bold text-blue-700 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          {g.title}
        </h4>
        <ul className="text-xs text-blue-600 space-y-1">
          {g.rules[0].items.slice(0, 2).map((item, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-blue-400 mt-0.5">•</span>
              {item}
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-blue-500">{g.qualityTips}</p>
      </div>
    );
  }

  return (
    <div className="bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl p-6 shadow-sm space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1">
          <BookOpen className="w-5 h-5 text-blue-600" />
          {g.title}
        </h3>
        <p className="text-sm text-gray-500">{g.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {g.rules.map((rule, i) => (
          <div key={i} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span>{rule.icon}</span>
              {rule.title}
            </h4>
            <ul className="text-sm text-gray-600 space-y-2">
              {rule.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2">
                  <span className="text-gray-400 mt-1 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Good vs Bad example */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <h4 className="font-bold text-emerald-700 mb-2 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            {g.examples.good.title}
          </h4>
          <p className="text-xs text-emerald-600 font-medium mb-1">{uiLang === 'zh' ? '含义：' : 'Meaning:'}</p>
          <p className="text-sm text-emerald-800 mb-2">{g.examples.good.meaning}</p>
          <p className="text-xs text-emerald-600 font-medium mb-1">{uiLang === 'zh' ? '例句：' : 'Example:'}</p>
          <p className="text-sm text-emerald-800 italic">"{g.examples.good.example}"</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <h4 className="font-bold text-red-600 mb-2 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            {g.examples.bad.title}
          </h4>
          <p className="text-xs text-red-500 font-medium mb-1">{uiLang === 'zh' ? '含义：' : 'Meaning:'}</p>
          <p className="text-sm text-red-700 mb-2">{g.examples.bad.meaning}</p>
          <p className="text-xs text-red-500 font-medium mb-1">{uiLang === 'zh' ? '例句：' : 'Example:'}</p>
          <p className="text-sm text-red-700 italic">"{g.examples.bad.example}"</p>
        </div>
      </div>

      <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        {g.qualityTips}
      </p>
    </div>
  );
}
