import React from 'react';
import { Loader2, ChevronRight, CheckCircle, AlertCircle, Mic, MicOff, X } from 'lucide-react';
import { motion } from 'motion/react';
import { GrammarCheckResult } from '../services/ai';
import { cn } from '../lib/utils';
import { Language, translations } from '../i18n';

interface GrammarPageProps {
  grammarInput: string;
  setGrammarInput: (v: string) => void;
  isCheckingGrammar: boolean;
  grammarResult: GrammarCheckResult | null;
  isListening: boolean;
  uiLang: Language;
  onCheckGrammar: (e?: React.FormEvent) => void;
  onToggleListening: () => void;
}

export default function GrammarPage(props: GrammarPageProps) {
  const {
    grammarInput, setGrammarInput, isCheckingGrammar, grammarResult,
    isListening, uiLang, onCheckGrammar, onToggleListening
  } = props;

  const t = translations[uiLang];

  return (
    <div className="space-y-6">
      {/* Grammar Input */}
      <form onSubmit={onCheckGrammar} className="relative group">
        <textarea
          value={grammarInput}
          onChange={(e) => setGrammarInput(e.target.value)}
          placeholder={t.grammarPlaceholder}
          rows={4}
          className="w-full bg-white border-2 border-transparent focus:border-blue-500 rounded-3xl py-4 sm:py-6 pl-6 sm:pl-8 pr-28 sm:pr-32 text-lg shadow-xl shadow-gray-200/50 outline-none transition-all placeholder:text-gray-300 resize-none"
        />
        {grammarInput && (
          <button
            type="button"
            onClick={() => setGrammarInput('')}
            className="absolute right-28 sm:right-32 top-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors z-20"
            aria-label={uiLang === 'zh' ? '清除输入' : 'Clear input'}
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <div className="absolute right-2 sm:right-4 bottom-4 flex items-center gap-1 sm:gap-2 z-20">
          <button
            type="button"
            onClick={onToggleListening}
            className={cn(
              "p-3 sm:p-4 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer",
              isListening ? "bg-red-500 text-white shadow-red-200" : "bg-gray-100 text-gray-500 shadow-gray-100"
            )}
          >
            {isListening ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
          <button
            type="submit"
            disabled={isCheckingGrammar || !grammarInput.trim()}
            className="bg-blue-600 text-white p-3 sm:p-4 rounded-2xl disabled:opacity-50 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-200"
          >
            {isCheckingGrammar ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
        </div>
      </form>

      {/* Example prompts when no result yet */}
      {!grammarResult && !grammarInput && (
        <div className="text-center py-6">
          <p className="text-sm text-gray-400 mb-3">{uiLang === 'zh' ? '试试这些：' : 'Try these:'}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              'I have went to the store yesterday',
              'She don\'t like coffee',
              'Me and him is friends',
            ].map((ex) => (
              <button
                key={ex}
                onClick={() => setGrammarInput(ex)}
                className="px-3 py-1.5 bg-gray-50 hover:bg-blue-50 text-gray-500 hover:text-blue-600 text-xs rounded-lg transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grammar Result */}
      {grammarResult && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100"
        >
          <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
            {grammarResult.hasErrors ? (
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-50 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
              </div>
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-50 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" />
              </div>
            )}
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">
                {grammarResult.hasErrors ? t.grammarIssues : t.grammarCorrect}
              </h3>
              <p className="text-gray-500 text-xs sm:text-sm line-clamp-1">{grammarResult.original}</p>
            </div>
          </div>

          {grammarResult.hasErrors && (
            <div className="space-y-8">
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                  {t.correctedVersion}
                </h4>
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                  <p className="text-blue-900 text-lg font-bold leading-relaxed">
                    {grammarResult.corrected}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                  {t.explanation}
                </h4>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 space-y-4">
                  <p className="text-gray-700 leading-relaxed">
                    {grammarResult.explanation}
                  </p>
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-gray-600 leading-relaxed italic">
                      {grammarResult.explanationZh}
                    </p>
                  </div>
                </div>
              </div>

              {grammarResult.edits && grammarResult.edits.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                    {uiLang === 'zh' ? '具体修改 (Specific Edits)' : 'Specific Edits'}
                  </h4>
                  <div className="space-y-3">
                    {grammarResult.edits.map((edit, idx) => (
                      <div key={idx} className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="line-through text-red-500 font-medium">{edit.originalText}</span>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                          <span className="text-green-600 font-bold">{edit.correctedText}</span>
                        </div>
                        <p className="text-sm text-gray-500">{edit.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {grammarResult.styleFeedback && (
            <div className="mt-8 space-y-8">
              <div>
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                  {uiLang === 'zh' ? '风格检测 (Style Feedback)' : 'Style Feedback'}
                </h4>
                <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 space-y-4">
                  <p className="text-purple-900 leading-relaxed">
                    {grammarResult.styleFeedback}
                  </p>
                  {grammarResult.academicSuggestion && (
                    <div className="border-t border-purple-200 pt-4">
                      <p className="text-xs text-purple-500 font-bold mb-2 uppercase tracking-wider">{uiLang === 'zh' ? '学术/正式建议:' : 'Academic/Formal Suggestion:'}</p>
                      <p className="text-purple-800 text-lg font-medium leading-relaxed italic">
                        {grammarResult.academicSuggestion}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
