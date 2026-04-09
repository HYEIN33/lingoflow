import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, CreditCard, Smartphone, ShieldCheck, Zap, Loader2 } from 'lucide-react';

export default function PaymentScreen({ 
  triggerSource = 'default', 
  onSuccess, 
  onClose, 
  currentPlan = 'free' 
}: { 
  triggerSource?: string, 
  onSuccess: () => void, 
  onClose: () => void, 
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
      case 'translation_limit': return '今日翻译次数已用完，升级 Pro 解锁无限畅译';
      case 'slider': return '语气滑块是 Pro 专属功能，升级以精准控制表达';
      case 'review_system': return '升级 Pro，解锁基于 SM-2 算法的艾宾浩斯复习系统';
      case 'leaderboard': return '加入小组排行榜竞争，赢取专属头衔';
      default: return '升级 Pro，解锁 LingoFlow 全部潜能';
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
    // Simulate payment processing
    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    }, 2000);
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-gray-900 rounded-3xl p-8 max-w-sm w-full text-center border border-teal-500/30 shadow-[0_0_50px_rgba(0,201,167,0.2)]"
        >
          <motion.div 
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5, delay: 0.2 }}
            className="w-24 h-24 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <Check className="w-12 h-12 text-teal-400" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2 font-serif">Pro 已激活</h2>
          <p className="text-gray-400">欢迎来到 LingoFlow 的全新境界</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
        className="bg-[#0f1115] rounded-3xl w-full max-w-4xl relative overflow-hidden border border-white/10 my-8"
      >
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-white/5 rounded-full z-10 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 text-center border-b border-white/5 bg-gradient-to-b from-teal-900/20 to-transparent">
          <h2 className="text-3xl font-bold text-white mb-3 font-serif">
            {getTriggerMessage()}
          </h2>
          <p className="text-gray-400">选择最适合您的学习方案</p>

          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`text-sm font-bold ${!isYearly ? 'text-white' : 'text-gray-500'}`}>月付</span>
            <button 
              onClick={() => setIsYearly(!isYearly)}
              className="w-14 h-8 bg-white/10 rounded-full p-1 relative transition-colors hover:bg-white/20"
            >
              <motion.div 
                animate={{ x: isYearly ? 24 : 0 }}
                className="w-6 h-6 bg-teal-400 rounded-full shadow-lg"
              />
            </button>
            <span className={`text-sm font-bold flex items-center gap-2 ${isYearly ? 'text-white' : 'text-gray-500'}`}>
              年付 <span className="bg-coral-500 text-white text-[10px] px-2 py-0.5 rounded-full">省 40%</span>
            </span>
          </div>
        </div>

        <div className="p-8 grid md:grid-cols-2 gap-6">
          {/* Free Plan */}
          <div 
            onClick={() => setSelectedPlan('free')}
            className={`rounded-2xl p-6 border transition-all cursor-pointer ${
              selectedPlan === 'free' ? 'bg-white/10 border-gray-400' : 'bg-white/5 border-white/5 hover:border-white/20'
            }`}
          >
            <h3 className="text-xl font-bold text-white mb-2">Free</h3>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-3xl font-bold text-white">¥0</span>
              <span className="text-gray-500">/月</span>
            </div>
            <ul className="space-y-4 text-sm text-gray-300">
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-gray-500" /> 基础 AI 翻译（每日限额）</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-gray-500" /> 梗百科浏览</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-gray-500" /> 第一段头衔（个人成就）</li>
            </ul>
          </div>

          {/* Pro Plan */}
          <div 
            onClick={() => setSelectedPlan('pro')}
            className={`rounded-2xl p-6 border relative transition-all cursor-pointer ${
              selectedPlan === 'pro' 
                ? 'bg-teal-900/20 border-teal-500 shadow-[0_0_30px_rgba(0,201,167,0.15)]' 
                : 'bg-white/5 border-white/5 hover:border-teal-500/50'
            }`}
          >
            <div className="absolute -top-3 -right-3 bg-gradient-to-r from-amber-400 to-amber-500 text-black text-xs font-black px-3 py-1 rounded-full shadow-lg">
              推荐
            </div>
            <h3 className="text-xl font-bold text-teal-400 mb-2 flex items-center gap-2">
              Pro <Zap className="w-5 h-5 fill-teal-400" />
            </h3>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-3xl font-bold text-white">¥{isYearly ? '28' : '48'}</span>
              <span className="text-gray-500">/月</span>
              {isYearly && <span className="text-xs text-gray-500 ml-2">每年计费 ¥336</span>}
            </div>
            <ul className="space-y-4 text-sm text-gray-200">
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-teal-400" /> 无限次 AI 翻译 + 语法检查</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-teal-400" /> 语气滑块（正式程度实时调节）</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-teal-400" /> 艾宾浩斯复习系统（SM-2 算法）</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-teal-400" /> 参与第二段小组头衔竞争</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-teal-400" /> UI 自定义权限（导航栏排序保存）</li>
              <li className="flex items-center gap-3"><Check className="w-4 h-4 text-teal-400" /> 优先 AI 响应速度</li>
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
              <div className="border-t border-white/10 pt-8">
                <h4 className="text-white font-bold mb-4">选择支付方式</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    { id: 'wechat', label: '微信支付', icon: '💬' },
                    { id: 'alipay', label: '支付宝', icon: '🛡️' },
                    { id: 'apple', label: 'Apple Pay', icon: '🍎' },
                    { id: 'card', label: '信用卡', icon: <CreditCard className="w-5 h-5" /> }
                  ].map(method => (
                    <button
                      key={method.id}
                      onClick={() => setPaymentMethod(method.id as any)}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all ${
                        paymentMethod === method.id ? 'bg-white/10 border-white text-white' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      <span className="text-2xl">{method.icon}</span>
                      <span className="text-xs font-bold">{method.label}</span>
                    </button>
                  ))}
                </div>

                {paymentMethod === 'card' && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-black/30 p-4 rounded-xl border border-white/10 mb-6 space-y-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">卡号</label>
                      <input 
                        type="text" 
                        value={cardNumber}
                        onChange={handleCardInput}
                        placeholder="0000 0000 0000 0000"
                        autoComplete="off"
                        className="w-full bg-transparent border-b border-gray-700 text-white p-2 focus:outline-none focus:border-teal-500 font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">有效期</label>
                        <input type="text" placeholder="MM/YY" autoComplete="off" className="w-full bg-transparent border-b border-gray-700 text-white p-2 focus:outline-none focus:border-teal-500 font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">CVV</label>
                        <input type="password" placeholder="123" autoComplete="off" maxLength={4} className="w-full bg-transparent border-b border-gray-700 text-white p-2 focus:outline-none focus:border-teal-500 font-mono" />
                      </div>
                    </div>
                  </motion.div>
                )}

                <button 
                  disabled={!paymentMethod || isProcessing}
                  onClick={handlePay}
                  className="w-full bg-teal-500 hover:bg-teal-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                  {isProcessing ? '处理中...' : `支付 ¥${isYearly ? '336' : '48'}`}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contribute for Pro */}
        <div className="p-4 text-center bg-white/5 border-t border-white/5">
          <button className="text-sm text-gray-400 hover:text-teal-400 transition-colors flex items-center justify-center gap-2 mx-auto">
            没钱？用贡献换 <ChevronRightIcon className="w-4 h-4" />
          </button>
          <p className="text-[10px] text-gray-600 mt-1">贡献 1500 积分可兑换永久 Pro</p>
        </div>
      </motion.div>
    </div>
  );
}

function ChevronRightIcon(props: any) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>;
}
