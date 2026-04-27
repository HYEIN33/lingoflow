import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, CreditCard, ShieldCheck, Zap, Loader2 } from 'lucide-react';

export default function PaymentScreen({
  triggerSource = 'default',
  onSuccess,
  onClose,
  uiLang = 'zh',
  currentPlan = 'free'
}: {
  triggerSource?: string,
  onSuccess: () => void,
  onClose: () => void,
  uiLang?: 'en' | 'zh',
  currentPlan?: 'free' | 'pro'
}) {
  const [isYearly, setIsYearly] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'pro'>('pro');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'alipay' | 'wechat' | 'apple' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [cardNumber, setCardNumber] = useState('');

  const getTriggerMessage = () => {
    switch (triggerSource) {
      case 'translation_limit': return uiLang === 'zh' ? '今日翻译次数已用完，升级 Pro 解锁无限畅译' : 'Daily translation limit reached. Upgrade to Pro for unlimited translations.';
      case 'slider': return uiLang === 'zh' ? '语气滑块是 Pro 专属功能，升级以精准控制表达' : 'Formality slider is a Pro feature.';
      case 'review_system': return uiLang === 'zh' ? '升级 Pro，解锁基于 SM-2 算法的艾宾浩斯复习系统' : 'Upgrade to unlock spaced repetition review.';
      default: return uiLang === 'zh' ? '升级 Pro，解锁 MemeFlow 全部潜能' : 'Upgrade to Pro, unlock MemeFlow\'s full potential.';
    }
  };

  const handleCardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    const formatted = val.match(/.{1,4}/g)?.join(' ') || '';
    setCardNumber(formatted.substring(0, 19));
  };

  const handlePay = () => {
    // Test mode: auto-succeed without real payment
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
      setTimeout(() => { onSuccess(); }, 1500);
    }, 1000);
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl p-8 max-w-sm w-full text-center border border-[var(--ink-hairline)] shadow-2xl"
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
            className="w-24 h-24 bg-[rgba(91,127,232,0.08)] rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <Check className="w-12 h-12 text-[#5B7FE8]" />
          </motion.div>
          <h2 className="font-display font-bold text-[26px] text-[var(--ink)] mb-2">
            Pro <em className="text-[var(--blue-accent)]">{uiLang === 'zh' ? '已激活' : 'Activated'}</em>
          </h2>
          <p className="font-zh-serif text-[14px] leading-[1.85] text-[var(--ink-body)]">
            {uiLang === 'zh'
              ? <>欢迎来到 MemeFlow 的全新境界<br /><span className="text-[var(--ink-muted)]">现在去试试 Formality 滑块 → 或者打开复习页看到期单词</span></>
              : <>Welcome to MemeFlow Pro<br /><span className="text-[var(--ink-muted)]">Try the Formality slider now → or open Review to see due words</span></>}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-h-full flex items-start sm:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
        className="glass-thick rounded-[28px] w-full max-w-4xl relative shadow-2xl my-4 sm:my-8"
      >
        <button onClick={onClose} className="sticky top-4 float-right mr-4 mt-4 p-2.5 text-[var(--ink-body)] hover:text-[var(--ink)] bg-white border border-[var(--ink-hairline)] rounded-full z-20 transition-colors shadow-sm">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-[36px_40px_28px] text-center border-b border-[var(--ink-hairline)] bg-gradient-to-b from-[#E8EEFC] to-transparent">
          <h2 className="font-display font-semibold text-[28px] leading-[1.2] tracking-[-0.03em] text-[var(--ink)] mb-[10px]">
            {getTriggerMessage().split(/(Pro)/).map((part, i) =>
              part === 'Pro'
                ? <em key={i} className="italic text-[var(--blue-accent)] font-medium">{part}</em>
                : <React.Fragment key={i}>{part}</React.Fragment>
            )}
          </h2>
          <p className="font-zh-sans font-medium text-[13.5px] leading-[1.75] text-[var(--ink-body)] tracking-[0.01em]">{uiLang === 'zh' ? '今日翻译次数已用完，Pro 用户享受无限次 AI 翻译' : 'Choose the plan that fits you'}</p>

          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`font-zh-serif text-[13px] font-bold ${!isYearly ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>{uiLang === 'zh' ? '月付 · Monthly' : 'Monthly'}</span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className="w-14 h-8 bg-gray-200 rounded-full p-1 relative transition-colors hover:bg-gray-300"
            >
              <motion.div animate={{ x: isYearly ? 24 : 0 }} className="w-6 h-6 bg-[#0A0E1A] rounded-full shadow-lg" />
            </button>
            <span className={`font-zh-serif text-[13px] font-bold flex items-center gap-2 ${isYearly ? 'text-[var(--ink)]' : 'text-[var(--ink-muted)]'}`}>
              {uiLang === 'zh' ? '年付 · Yearly' : 'Yearly'} <span className="bg-[#FFE0B2] text-[#9B5400] font-mono-meta text-[10px] px-2 py-[3px] rounded-full font-extrabold tracking-[0.1em]">{uiLang === 'zh' ? '省 40%' : 'SAVE 40%'}</span>
            </span>
          </div>
        </div>

        {/* Plans */}
        <div className="p-8 grid md:grid-cols-2 gap-5">
          {/* Free Plan */}
          <div
            onClick={() => setSelectedPlan('free')}
            className={`rounded-2xl p-6 border-2 transition-all cursor-pointer ${
              selectedPlan === 'free' ? 'bg-gray-50 border-[var(--border-solid-strong)]' : 'bg-white border-[var(--border-solid)] hover:border-[var(--border-solid-strong)]'
            }`}
          >
            <h3 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--ink)] mb-[10px]">Free</h3>
            <div className="flex items-baseline gap-[6px] mb-[20px]">
              <span className="font-display font-bold text-[34px] tracking-[-0.03em] text-[var(--ink)]">¥0</span>
              <span className="font-zh-serif text-[13px] text-[var(--ink-muted)]">/ {uiLang === 'zh' ? '月' : 'mo'}</span>
            </div>
            <ul className="space-y-[10px] font-zh-sans font-medium text-[13.5px] leading-[1.6] text-[var(--ink-body)] tracking-[0.01em]">
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--ink-subtle)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? '基础 AI 翻译（每日 20 次）' : 'Basic AI translation (daily limit)'}</li>
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--ink-subtle)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? '梗百科浏览与投稿' : 'Slang dictionary browsing & contributing'}</li>
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--ink-subtle)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? '成就徽章系统' : 'Achievement badge system'}</li>
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--ink-subtle)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? '小组排行榜' : 'Group leaderboard'}</li>
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--ink-subtle)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? 'Tab 栏自定义排序' : 'UI customization (tab order)'}</li>
            </ul>
          </div>

          {/* Pro Plan */}
          <div
            onClick={() => setSelectedPlan('pro')}
            className={`rounded-2xl p-6 border-2 relative transition-all cursor-pointer ${
              selectedPlan === 'pro'
                ? 'bg-[rgba(91,127,232,0.06)] border-[var(--blue-accent)] shadow-[0_10px_28px_rgba(91,127,232,0.18)]'
                : 'bg-white border-[var(--border-solid)] hover:border-[rgba(91,127,232,0.4)]'
            }`}
          >
            <div className="absolute -top-3 -right-2 bg-gradient-to-br from-[#F0D78A] to-[#E88B7D] text-white font-display italic font-bold text-[10.5px] tracking-[0.04em] px-[12px] py-[4px] rounded-full shadow-[0_6px_14px_rgba(232,139,125,0.3)]">
              {uiLang === 'zh' ? '推荐 · Best' : 'Best'}
            </div>
            <h3 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--blue-accent)] mb-[10px] flex items-center gap-2">
              Pro <Zap className="w-[18px] h-[18px] fill-[var(--blue-accent)] text-[var(--blue-accent)]" />
            </h3>
            <div className="flex items-baseline gap-[6px] mb-[20px] flex-wrap">
              <span className="font-display font-bold text-[34px] tracking-[-0.03em] text-[var(--ink)]">¥{isYearly ? '28' : '48'}</span>
              <span className="font-zh-serif text-[13px] text-[var(--ink-muted)]">/ {uiLang === 'zh' ? '月' : 'mo'}</span>
              {isYearly && <span className="font-mono-meta text-[10.5px] text-[var(--ink-muted)] ml-2">{uiLang === 'zh' ? '每年计费 ¥336' : 'Billed ¥336/year'}</span>}
            </div>
            <ul className="space-y-[10px] font-zh-sans font-medium text-[13.5px] leading-[1.6] text-[var(--ink-body)] tracking-[0.01em]">
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--blue-accent)] shrink-0 mt-[2px]" /> <strong className="text-[var(--blue-accent)] font-bold">{uiLang === 'zh' ? '无限次 AI 翻译 + 语法检查' : 'Unlimited AI translation + grammar'}</strong></li>
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--blue-accent)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? 'Formality 滑块（正式程度调节）' : 'Formality slider'}</li>
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--blue-accent)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? '艾宾浩斯复习系统（SM-2）' : 'Spaced repetition (SM-2)'}</li>
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--blue-accent)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? '优先 AI 响应 & 课堂同传无限时长' : 'Priority AI response & unlimited classroom'}</li>
              <li className="flex items-start gap-[10px]"><Check className="w-4 h-4 text-[var(--blue-accent)] shrink-0 mt-[2px]" /> {uiLang === 'zh' ? '全球排行榜参与资格 + Pro 徽标' : 'Global leaderboard + Pro badge'}</li>
            </ul>
          </div>
        </div>

        {/* Payment Section */}
        <AnimatePresence>
          {selectedPlan === 'pro' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="px-8 pb-8 overflow-hidden"
            >
              <div className="border-t border-[var(--ink-hairline)] pt-8">
                <h4 className="font-display italic font-medium text-[14px] text-[var(--ink-body)] mb-[14px]">— {uiLang === 'zh' ? '选择支付方式' : 'Payment method'}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  {[
                    {
                      id: 'wechat',
                      label: uiLang === 'zh' ? '微信支付' : 'WeChat',
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                      ),
                    },
                    {
                      id: 'alipay',
                      label: uiLang === 'zh' ? '支付宝' : 'Alipay',
                      icon: <ShieldCheck className="w-5 h-5" strokeWidth={1.8} />,
                    },
                    {
                      id: 'apple',
                      label: 'Apple Pay',
                      icon: (
                        <svg width="18" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                        </svg>
                      ),
                    },
                    {
                      id: 'card',
                      label: uiLang === 'zh' ? '信用卡 · Card' : 'Card',
                      icon: <CreditCard className="w-5 h-5" />,
                    },
                  ].map(method => (
                    <button
                      key={method.id}
                      onClick={() => setPaymentMethod(method.id as any)}
                      className={`flex flex-col items-center justify-center gap-[10px] p-[18px_12px] rounded-[14px] border-2 transition-all ${
                        paymentMethod === method.id ? 'bg-[rgba(91,127,232,0.08)] border-[var(--blue-accent)] text-[var(--blue-accent)]' : 'bg-white border-[var(--border-solid)] text-[var(--ink-body)] hover:border-[rgba(91,127,232,0.3)]'
                      }`}
                    >
                      <span className="inline-flex items-center justify-center h-6">{method.icon}</span>
                      <span className="font-zh-serif text-[12.5px] font-bold">{method.label}</span>
                    </button>
                  ))}
                </div>

                {paymentMethod === 'card' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-50 p-4 rounded-xl border border-[var(--ink-hairline)] mb-6 space-y-4">
                    <div>
                      <label className="block text-xs text-[var(--ink-muted)] mb-1">{uiLang === 'zh' ? '卡号' : 'Card number'}</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={handleCardInput}
                        placeholder="0000 0000 0000 0000"
                        autoComplete="off"
                        className="w-full bg-white border border-[var(--ink-hairline)] rounded-lg text-[var(--ink)] p-3 focus:outline-none focus:ring-2 focus:ring-[#5B7FE8] font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-[var(--ink-muted)] mb-1">{uiLang === 'zh' ? '有效期' : 'Expiry'}</label>
                        <input type="text" placeholder="MM/YY" autoComplete="off" className="w-full bg-white border border-[var(--ink-hairline)] rounded-lg text-[var(--ink)] p-3 focus:outline-none focus:ring-2 focus:ring-[#5B7FE8] font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs text-[var(--ink-muted)] mb-1">CVV</label>
                        <input type="password" placeholder="123" autoComplete="off" maxLength={4} className="w-full bg-white border border-[var(--ink-hairline)] rounded-lg text-[var(--ink)] p-3 focus:outline-none focus:ring-2 focus:ring-[#5B7FE8] font-mono" />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Trust guarantees — refund / encryption / cancel anytime */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 mb-5 bg-[rgba(47,99,23,0.05)] border border-[rgba(47,99,23,0.25)] border-l-[3px] border-l-[var(--green-ok)] rounded-xl">
                  <div className="flex items-start gap-2 font-zh-sans font-medium text-[12.5px] text-[var(--ink-body)] leading-[1.6]">
                    <ShieldCheck className="w-4 h-4 text-[var(--green-ok)] shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-bold text-[var(--ink)]">
                        {uiLang === 'zh' ? '7 天无理由退款' : '7-day refund'}
                      </strong>
                      {uiLang === 'zh' ? ' · 不满意全额返还' : ' · full refund if unhappy'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 font-zh-sans font-medium text-[12.5px] text-[var(--ink-body)] leading-[1.6]">
                    <ShieldCheck className="w-4 h-4 text-[var(--green-ok)] shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-bold text-[var(--ink)]">
                        {uiLang === 'zh' ? '256 位加密' : '256-bit encryption'}
                      </strong>
                      {uiLang === 'zh' ? ' · Stripe / 支付宝 / 微信官方通道' : ' · Stripe / Alipay / WeChat official'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 font-zh-sans font-medium text-[12.5px] text-[var(--ink-body)] leading-[1.6]">
                    <ShieldCheck className="w-4 h-4 text-[var(--green-ok)] shrink-0 mt-0.5" />
                    <span>
                      <strong className="font-bold text-[var(--ink)]">
                        {uiLang === 'zh' ? '随时取消' : 'Cancel anytime'}
                      </strong>
                      {uiLang === 'zh' ? ' · 续费前 3 天邮件提醒' : ' · email before renewal'}
                    </span>
                  </div>
                </div>

                <button
                  disabled={!paymentMethod || isProcessing}
                  onClick={handlePay}
                  className="w-full bg-[var(--ink)] hover:bg-[#1a2440] disabled:bg-gray-200 disabled:text-[var(--ink-muted)] text-white font-zh-serif font-bold text-[15px] py-[15px] rounded-[14px] transition-colors flex items-center justify-center gap-2 shadow-[0_6px_18px_rgba(10,14,26,0.25)]"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {isProcessing
                    ? (uiLang === 'zh' ? '处理中...' : 'Processing...')
                    : `${uiLang === 'zh' ? '支付' : 'Pay'} ¥${isYearly ? '336' : '48'}${uiLang === 'zh' ? ' · 开始 Pro 之旅' : ''}`}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="p-4 text-center bg-gray-50 border-t border-[var(--ink-hairline)] space-y-2">
          <p className="font-zh-sans font-medium text-[12.5px] leading-[1.9] text-[var(--ink-body)] tracking-[0.01em]">
            {uiLang === 'zh' ? '贡献 1500 积分可兑换永久 Pro · 随时可取消订阅，不自动续费时会邮件提醒' : 'Earn 1500 points to redeem permanent Pro. Cancel anytime.'}
          </p>
          <button onClick={onClose} className="font-zh-serif text-sm text-[var(--blue-accent)] hover:text-[var(--blue-accent-deep)] font-medium py-1">
            {uiLang === 'zh' ? '← 返回' : '← Back'}
          </button>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
