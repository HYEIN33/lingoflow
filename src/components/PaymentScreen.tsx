import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
      default: return uiLang === 'zh' ? '升级 Pro，解锁 LingoFlow 全部潜能' : 'Upgrade to Pro, unlock LingoFlow\'s full potential.';
    }
  };

  const handleCardInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    const formatted = val.match(/.{1,4}/g)?.join(' ') || '';
    setCardNumber(formatted.substring(0, 19));
  };

  const handlePay = () => {
    if (!paymentMethod) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
      setTimeout(() => { onSuccess(); }, 2000);
    }, 2000);
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl p-8 max-w-sm w-full text-center border border-gray-200 shadow-2xl"
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
            className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <Check className="w-12 h-12 text-blue-600" />
          </motion.div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Pro {uiLang === 'zh' ? '已激活' : 'Activated'}</h2>
          <p className="text-gray-500">{uiLang === 'zh' ? '欢迎来到 LingoFlow 的全新境界' : 'Welcome to LingoFlow Pro'}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
        className="bg-white rounded-3xl w-full max-w-4xl relative overflow-hidden border border-gray-200 shadow-2xl my-8"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full z-10 transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-8 text-center border-b border-gray-100 bg-gradient-to-b from-blue-50 to-transparent">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">{getTriggerMessage()}</h2>
          <p className="text-gray-500">{uiLang === 'zh' ? '选择最适合您的学习方案' : 'Choose the plan that fits you'}</p>

          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`text-sm font-bold ${!isYearly ? 'text-gray-900' : 'text-gray-400'}`}>{uiLang === 'zh' ? '月付' : 'Monthly'}</span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className="w-14 h-8 bg-gray-200 rounded-full p-1 relative transition-colors hover:bg-gray-300"
            >
              <motion.div animate={{ x: isYearly ? 24 : 0 }} className="w-6 h-6 bg-blue-600 rounded-full shadow-lg" />
            </button>
            <span className={`text-sm font-bold flex items-center gap-2 ${isYearly ? 'text-gray-900' : 'text-gray-400'}`}>
              {uiLang === 'zh' ? '年付' : 'Yearly'} <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded-full font-black">{uiLang === 'zh' ? '省 40%' : 'Save 40%'}</span>
            </span>
          </div>
        </div>

        {/* Plans */}
        <div className="p-8 grid md:grid-cols-2 gap-6">
          {/* Free Plan */}
          <div
            onClick={() => setSelectedPlan('free')}
            className={`rounded-2xl p-6 border-2 transition-all cursor-pointer ${
              selectedPlan === 'free' ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-100 hover:border-gray-200'
            }`}
          >
            <h3 className="text-xl font-bold text-gray-900 mb-2">Free</h3>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-3xl font-bold text-gray-900">¥0</span>
              <span className="text-gray-400">/{uiLang === 'zh' ? '月' : 'mo'}</span>
            </div>
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-gray-400 shrink-0" /> {uiLang === 'zh' ? '基础 AI 翻译（每日限额）' : 'Basic AI translation (daily limit)'}</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-gray-400 shrink-0" /> {uiLang === 'zh' ? '梗百科浏览与贡献' : 'Slang dictionary browsing & contributing'}</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-gray-400 shrink-0" /> {uiLang === 'zh' ? '成就勋章系统' : 'Achievement badge system'}</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-gray-400 shrink-0" /> {uiLang === 'zh' ? '小组排行榜竞争' : 'Group leaderboard competition'}</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-gray-400 shrink-0" /> {uiLang === 'zh' ? 'UI 自定义（导航栏排序）' : 'UI customization (tab order)'}</li>
            </ul>
          </div>

          {/* Pro Plan */}
          <div
            onClick={() => setSelectedPlan('pro')}
            className={`rounded-2xl p-6 border-2 relative transition-all cursor-pointer ${
              selectedPlan === 'pro'
                ? 'bg-blue-50 border-blue-400 shadow-lg shadow-blue-100'
                : 'bg-white border-gray-100 hover:border-blue-200'
            }`}
          >
            <div className="absolute -top-3 -right-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-black px-3 py-1 rounded-full shadow-lg">
              {uiLang === 'zh' ? '推荐' : 'Best'}
            </div>
            <h3 className="text-xl font-bold text-blue-600 mb-2 flex items-center gap-2">
              Pro <Zap className="w-5 h-5 fill-blue-600" />
            </h3>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-3xl font-bold text-gray-900">¥{isYearly ? '28' : '48'}</span>
              <span className="text-gray-400">/{uiLang === 'zh' ? '月' : 'mo'}</span>
              {isYearly && <span className="text-xs text-gray-400 ml-2">{uiLang === 'zh' ? '每年计费 ¥336' : 'Billed ¥336/year'}</span>}
            </div>
            <ul className="space-y-3 text-sm text-gray-700">
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-600 shrink-0" /> {uiLang === 'zh' ? '无限次 AI 翻译 + 语法检查' : 'Unlimited AI translation + grammar'}</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-600 shrink-0" /> {uiLang === 'zh' ? '语气滑块（正式程度调节）' : 'Formality slider'}</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-600 shrink-0" /> {uiLang === 'zh' ? '艾宾浩斯复习系统（SM-2）' : 'Spaced repetition (SM-2)'}</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-600 shrink-0" /> {uiLang === 'zh' ? '优先 AI 响应速度' : 'Priority AI response'}</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-blue-600 shrink-0" /> {uiLang === 'zh' ? '全球排行榜参与资格' : 'Global leaderboard access'}</li>
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
              <div className="border-t border-gray-100 pt-8">
                <h4 className="text-gray-900 font-bold mb-4">{uiLang === 'zh' ? '选择支付方式' : 'Payment method'}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    { id: 'wechat', label: uiLang === 'zh' ? '微信支付' : 'WeChat', icon: '💬' },
                    { id: 'alipay', label: uiLang === 'zh' ? '支付宝' : 'Alipay', icon: '🛡️' },
                    { id: 'apple', label: 'Apple Pay', icon: '🍎' },
                    { id: 'card', label: uiLang === 'zh' ? '信用卡' : 'Card', icon: <CreditCard className="w-5 h-5" /> }
                  ].map(method => (
                    <button
                      key={method.id}
                      onClick={() => setPaymentMethod(method.id as any)}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        paymentMethod === method.id ? 'bg-blue-50 border-blue-400 text-blue-600' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200'
                      }`}
                    >
                      <span className="text-2xl">{method.icon}</span>
                      <span className="text-xs font-bold">{method.label}</span>
                    </button>
                  ))}
                </div>

                {paymentMethod === 'card' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 space-y-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">{uiLang === 'zh' ? '卡号' : 'Card number'}</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={handleCardInput}
                        placeholder="0000 0000 0000 0000"
                        autoComplete="off"
                        className="w-full bg-white border border-gray-200 rounded-lg text-gray-900 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{uiLang === 'zh' ? '有效期' : 'Expiry'}</label>
                        <input type="text" placeholder="MM/YY" autoComplete="off" className="w-full bg-white border border-gray-200 rounded-lg text-gray-900 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">CVV</label>
                        <input type="password" placeholder="123" autoComplete="off" maxLength={4} className="w-full bg-white border border-gray-200 rounded-lg text-gray-900 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
                      </div>
                    </div>
                  </motion.div>
                )}

                <button
                  disabled={!paymentMethod || isProcessing}
                  onClick={handlePay}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                  {isProcessing ? (uiLang === 'zh' ? '处理中...' : 'Processing...') : `${uiLang === 'zh' ? '支付' : 'Pay'} ¥${isYearly ? '336' : '48'}`}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="p-4 text-center bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-400">{uiLang === 'zh' ? '贡献 1500 积分可兑换永久 Pro' : 'Earn 1500 points to redeem permanent Pro'}</p>
        </div>
      </motion.div>
    </div>
  );
}
