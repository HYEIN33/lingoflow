import React from 'react';
import { Search, BookOpen, Trash2, Loader2, Volume2, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Language, translations } from '../i18n';
import { SavedWord } from '../App';

interface WordbookPageProps {
  savedWords: SavedWord[];
  filteredWords: SavedWord[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  wordbookFilter: 'all' | 'authentic' | 'academic' | 'standard';
  setWordbookFilter: (v: any) => void;
  selectedWordbookItem: SavedWord | null;
  setSelectedWordbookItem: (v: SavedWord | null) => void;
  selectedUsageIndex: number;
  setSelectedUsageIndex: (v: number) => void;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  loadingAudioText: string | null;
  uiLang: Language;
  onSpeak: (text: string) => void;
  onDeleteWord: (id: string) => Promise<void>;
}

export default function WordbookPage(props: WordbookPageProps) {
  const {
    savedWords, filteredWords, searchQuery, setSearchQuery,
    wordbookFilter, setWordbookFilter, selectedWordbookItem, setSelectedWordbookItem,
    selectedUsageIndex, setSelectedUsageIndex, showDetails, setShowDetails,
    loadingAudioText, uiLang, onSpeak, onDeleteWord
  } = props;

  const t = translations[uiLang];

  return (
    <div className="space-y-4">
      {selectedWordbookItem ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <button
            onClick={() => {
              setSelectedWordbookItem(null);
              setSelectedUsageIndex(0);
            }}
            className="flex items-center gap-2 text-blue-600 font-bold hover:text-blue-700 transition-colors mb-4"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
            {uiLang === 'zh' ? '返回列表' : 'Back to List'}
          </button>

          <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 sm:gap-0 mb-6 sm:mb-8">
              <div className="w-full sm:w-auto">
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex flex-col">
                    <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight break-words">
                      {selectedWordbookItem.original}
                    </h2>
                    <p className="text-lg sm:text-xl font-bold text-blue-600 mt-1">
                      {selectedWordbookItem.usages[selectedUsageIndex].meaningZh}
                    </p>
                  </div>
                  <button
                    onClick={() => onSpeak(selectedWordbookItem.original)}
                    disabled={loadingAudioText === selectedWordbookItem.original}
                    className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-colors self-start mt-2 disabled:opacity-50"
                  >
                    {loadingAudioText === selectedWordbookItem.original ? (
                      <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                    ) : (
                      <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {selectedWordbookItem.pronunciation && (
                    <span className="text-blue-600 font-mono font-medium bg-blue-50 px-3 py-1 rounded-lg text-xs sm:text-sm">
                      {selectedWordbookItem.pronunciation}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => onDeleteWord(selectedWordbookItem.id).then(() => setSelectedWordbookItem(null))}
                className="w-full sm:w-auto p-3 sm:p-4 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all flex items-center justify-center border border-gray-100 sm:border-transparent"
              >
                <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="sm:hidden ml-2 font-bold">{t.delete}</span>
              </button>
            </div>

            {/* Frequency Tabs */}
            <div className="mb-8">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                {uiLang === 'zh' ? '使用频率' : 'Usage Frequency'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedWordbookItem.usages.map((usage, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedUsageIndex(idx);
                      setShowDetails(false);
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-bold transition-all border-2",
                      selectedUsageIndex === idx
                        ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105"
                        : "bg-white border-gray-100 text-gray-400 hover:border-blue-200 hover:text-blue-400"
                    )}
                  >
                    {uiLang === 'zh' ? usage.labelZh : usage.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <motion.div
                key={selectedUsageIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                    {uiLang === 'zh' ? '释义' : 'Meaning'}
                  </h3>
                  <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-3">
                    <p className="text-blue-600 text-lg font-medium leading-relaxed">
                      {selectedWordbookItem.usages[selectedUsageIndex].meaningZh}
                    </p>
                  </div>
                </div>

                {/* Details Toggle */}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:text-blue-700 transition-colors"
                >
                  {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showDetails ? t.hideDetails : t.showDetails}
                </button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-6 space-y-6 border-t border-gray-100">
                        {selectedWordbookItem.usages[selectedUsageIndex].synonyms && selectedWordbookItem.usages[selectedUsageIndex].synonyms.length > 0 && (
                          <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                              {t.synonyms}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedWordbookItem.usages[selectedUsageIndex].synonyms.map((syn, i) => (
                                <span key={i} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-medium">
                                  {syn}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedWordbookItem.usages[selectedUsageIndex].alternatives && selectedWordbookItem.usages[selectedUsageIndex].alternatives.length > 0 && (
                          <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                              {t.alternatives}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedWordbookItem.usages[selectedUsageIndex].alternatives.map((alt, i) => (
                                <span key={i} className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-sm font-medium">
                                  {alt}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                    {t.examples}
                  </h3>
                  <div className="space-y-4">
                    {selectedWordbookItem.usages[selectedUsageIndex].examples.map((ex, i) => (
                      <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 space-y-3 group/ex hover:border-blue-200 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex gap-4">
                            <span className="text-blue-200 font-black text-xl italic">{String(i + 1).padStart(2, '0')}</span>
                            <p className="text-gray-800 font-medium leading-relaxed text-lg">{ex.sentence}</p>
                          </div>
                          <button
                            onClick={() => onSpeak(ex.sentence)}
                            disabled={loadingAudioText === ex.sentence}
                            className="p-2 text-gray-300 hover:text-blue-500 transition-colors shrink-0 disabled:opacity-50"
                          >
                            {loadingAudioText === ex.sentence ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Volume2 className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                        <p className="text-gray-500 pl-12 border-l-2 border-blue-50 italic">{ex.translation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      ) : savedWords.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
          <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">{t.emptyWordbook}</p>
          <p className="text-gray-300 text-sm mt-2">
            {uiLang === 'zh' ? '翻译单词后点击保存，就会出现在这里' : 'Translate a word and save it to see it here'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{t.wordbook}</h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={t.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:border-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          {/* Style Filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { id: 'all', label: uiLang === 'zh' ? '全部' : 'All' },
              { id: 'authentic', label: uiLang === 'zh' ? '地道' : 'Authentic' },
              { id: 'academic', label: uiLang === 'zh' ? '学术' : 'Academic' },
              { id: 'standard', label: uiLang === 'zh' ? '标准' : 'Standard' }
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setWordbookFilter(filter.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                  wordbookFilter === filter.id
                    ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                    : "bg-white border-gray-100 text-gray-400 hover:border-blue-200 hover:text-blue-400"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWords.map((word) => (
              <motion.div
                layout
                key={word.id}
                onClick={() => setSelectedWordbookItem(word)}
                className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between group hover:shadow-md hover:border-blue-200 transition-all cursor-pointer gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight break-words">{word.original}</h3>
                        {word.styleTag && word.styleTag !== 'standard' && (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                            word.styleTag === 'authentic' ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"
                          )}>
                            {word.styleTag === 'authentic' ? t.styleAuthentic : t.styleAcademic}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs sm:text-sm font-medium text-blue-600">{word.usages[0].meaningZh}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSpeak(word.original);
                      }}
                      disabled={loadingAudioText === word.original}
                      className="p-2 text-gray-300 hover:text-blue-500 transition-colors shrink-0 disabled:opacity-50"
                    >
                      {loadingAudioText === word.original ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteWord(word.id);
                      }}
                      className="p-2 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="text-[10px] text-gray-300 sm:hidden">
                    {word.createdAt?.toDate().toLocaleDateString()}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
