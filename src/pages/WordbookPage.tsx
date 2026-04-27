import React, { useState } from 'react';
import { Search, BookOpen, Trash2, Loader2, Volume2, ChevronRight, ChevronDown, ChevronUp, FolderPlus, Folder, FolderOpen, MoreHorizontal, Pencil, Check, X, CheckSquare, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Language, translations } from '../i18n';
import { SavedWord } from '../App';

export interface WordbookFolder {
  id: string;
  name: string;
  createdAt: number;
}

interface WordbookPageProps {
  savedWords: SavedWord[];
  filteredWords: SavedWord[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  wordbookFilter: 'all' | 'authentic' | 'academic' | 'standard' | 'slang';
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
  // Folder props
  folders: WordbookFolder[];
  wordFolderMap: Record<string, string>; // wordId -> folderId
  activeFolderId: string | null;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onSetActiveFolder: (id: string | null) => void;
  onMoveWordsToFolder: (wordIds: string[], folderId: string | null) => void;
}

// Inline tag style helper — each styleTag maps to one of three chip looks.
const tagChipStyle = (tag: string | undefined): string => {
  if (tag === 'authentic') return 'bg-[rgba(91,127,232,0.12)] text-[var(--blue-accent)] border border-[rgba(91,127,232,0.25)]';
  if (tag === 'academic') return 'bg-[rgba(168,168,217,0.15)] text-[#7D6EA3] border border-[rgba(168,168,217,0.3)]';
  return 'bg-[rgba(10,14,26,0.06)] text-[rgba(10,14,26,0.7)] border border-[rgba(10,14,26,0.1)]';
};

export default function WordbookPage(props: WordbookPageProps) {
  const {
    savedWords, filteredWords, searchQuery, setSearchQuery,
    wordbookFilter, setWordbookFilter, selectedWordbookItem, setSelectedWordbookItem,
    selectedUsageIndex, setSelectedUsageIndex, showDetails, setShowDetails,
    loadingAudioText, uiLang, onSpeak, onDeleteWord,
    folders, wordFolderMap, activeFolderId, onCreateFolder, onRenameFolder,
    onDeleteFolder, onSetActiveFolder, onMoveWordsToFolder
  } = props;

  const t = translations[uiLang];
  const [showFolderCreate, setShowFolderCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [showBatchMoveMenu, setShowBatchMoveMenu] = useState(false);
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);

  // Filter words by active folder
  const folderFilteredWords = activeFolderId
    ? filteredWords.filter(w => wordFolderMap[w.id] === activeFolderId)
    : filteredWords;

  const toggleWordSelection = (id: string) => {
    const next = new Set(selectedWordIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedWordIds(next);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    onCreateFolder(newFolderName.trim());
    setNewFolderName('');
    setShowFolderCreate(false);
  };

  const handleBatchMove = (folderId: string | null) => {
    onMoveWordsToFolder(Array.from(selectedWordIds), folderId);
    setSelectedWordIds(new Set());
    setBatchMode(false);
    setShowBatchMoveMenu(false);
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedWordIds);
    for (const id of ids) {
      await onDeleteWord(id);
    }
    setSelectedWordIds(new Set());
    setBatchMode(false);
  };

  // === SRS 统计 ===
  // nextReviewDate / interval / createdAt 取自 SavedWord 定义。
  // 字段可能缺失（老数据或 Firestore 迁移未完），渲染处都做了 fallback。
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dueTodayCount = savedWords.filter(w => {
    const d = w.nextReviewDate?.toDate?.();
    return d && d <= now;
  }).length;
  const masteredCount = savedWords.filter(w => (w.interval ?? 0) >= 30).length;
  const masteredPct = savedWords.length > 0 ? Math.round(masteredCount / savedWords.length * 100) : 0;
  const weekNew = savedWords.filter(w => {
    const d = w.createdAt?.toDate?.();
    return d && d >= oneWeekAgo;
  }).length;

  // Summary pill items — 4 项统计，空态也显示。
  // tooltip 用原生 title 属性，hover 时浏览器显示解释；零依赖、不增加 bundle。
  const summaryItems = [
    {
      label: uiLang === 'zh' ? '收藏' : 'saved',
      value: String(savedWords.length),
      color: 'text-[var(--ink)]',
      tooltip: uiLang === 'zh'
        ? '你一共收藏的单词数量'
        : 'Total words you have saved',
    },
    {
      label: uiLang === 'zh' ? '今天待复习' : 'due today',
      value: savedWords.length > 0 ? String(dueTodayCount) : '—',
      color: 'text-[var(--blue-accent)]',
      tooltip: uiLang === 'zh'
        ? '根据艾宾浩斯曲线，今天到期的词'
        : 'Words due today per the Ebbinghaus forgetting curve',
    },
    {
      label: uiLang === 'zh' ? '已掌握' : 'mastered',
      value: savedWords.length > 0 ? `${masteredPct}%` : '—',
      color: 'text-[var(--green-ok)]',
      tooltip: uiLang === 'zh'
        ? '间隔 ≥ 30 天的词，你已经记住了'
        : 'Words with review interval ≥ 30 days — you have memorized them',
    },
    {
      label: uiLang === 'zh' ? '本周新增' : 'this week',
      value: savedWords.length > 0 ? String(weekNew) : '—',
      color: 'text-[rgba(10,14,26,0.55)]',
      tooltip: uiLang === 'zh'
        ? '过去 7 天你新收藏的单词数量'
        : 'Words you saved in the last 7 days',
    },
  ];

  // 单词 SRS 状态文案（给 word-card footer）
  // 返回值带 dot（颜色点） + text（文案） + color（文字颜色 Tailwind class）+ dotColor（圆点 bg class）
  // 直白文案：
  //   - 已掌握：✓ 已掌握 · 不用再练
  //   - 今天到期：⏰ 今天该练了
  //   - 未来 N 天：📅 N 天后再练（4 月 30 日）
  const getSrsMeta = (word: SavedWord) => {
    const interval = word.interval ?? 0;
    if (interval >= 30) {
      return {
        text: uiLang === 'zh' ? '已掌握' : 'mastered',
        color: 'text-[var(--green-ok)]',
        dotColor: 'bg-[var(--green-ok)]',
        showDot: false,
      };
    }
    const d = word.nextReviewDate?.toDate?.();
    if (!d) return { text: '—', color: 'text-[var(--ink-subtle)]', dotColor: 'bg-[var(--ink-subtle)]', showDot: false };
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (d <= today) {
      return {
        text: uiLang === 'zh' ? '今天复习' : 'due today',
        color: 'text-[var(--blue-accent)]',
        dotColor: 'bg-[var(--blue-accent)]',
        showDot: true,
      };
    }
    const days = Math.max(1, Math.ceil((d.getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000)));
    return {
      text: uiLang === 'zh'
        ? `${days} 天后复习`
        : `${days} days`,
      color: 'text-[var(--ink-muted)]',
      dotColor: 'bg-[var(--ink-subtle)]',
      showDot: false,
    };
  };

  return (
    <div className="space-y-4">
      {/* Summary pill (4 项) — 顶部常驻。对齐 wordbook.html 原型：
          单条白色 surface 横排 · 数字大 · 标签小 · 中间用竖线分隔 */}
      {!selectedWordbookItem && (
        <section className="surface !rounded-[14px] px-5 py-3.5 flex items-center flex-wrap gap-x-6 gap-y-2 mb-4">
          {summaryItems.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <span className="inline-block w-px h-[18px] bg-[var(--ink-hairline)]" aria-hidden="true" />}
              <div className="flex items-baseline gap-1.5 cursor-help" title={s.tooltip}>
                <strong className={`font-display font-bold text-[20px] tracking-[-0.02em] ${s.color}`}>{s.value}</strong>
                <span className="font-zh-serif text-[12px] text-[rgba(10,14,26,0.62)]">{s.label}</span>
              </div>
            </React.Fragment>
          ))}
        </section>
      )}
      {selectedWordbookItem ? (
        /* ======================== DETAIL VIEW ======================== */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <button
            onClick={() => {
              setSelectedWordbookItem(null);
              setSelectedUsageIndex(0);
            }}
            className="inline-flex items-center gap-1.5 py-1.5 pl-2 pr-3 font-display italic text-[13px] text-[var(--blue-accent)] hover:text-[var(--blue-accent-deep)] transition-colors"
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
            {uiLang === 'zh' ? '返回列表 · back' : 'back · 返回列表'}
          </button>

          <article className="surface !rounded-[18px] p-6 sm:p-[32px_36px_28px]">
            {/* Detail head */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-5 pb-[22px] border-b border-[var(--ink-hairline)]">
              <div className="w-full sm:w-auto">
                <h2 className="font-display font-bold tracking-[-0.03em] leading-none m-0 mb-1.5 text-[34px] sm:text-[46px] break-words">
                  <em className="italic text-[var(--blue-accent)] font-medium">{selectedWordbookItem.original}</em>
                </h2>
                <p className="font-zh-serif text-[20px] font-medium text-[var(--ink)] m-0 mb-2.5">
                  {selectedWordbookItem.usages?.[selectedUsageIndex]?.meaningZh || ''}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedWordbookItem.pronunciation && (
                    <span className="font-mono-meta text-[12px] text-[var(--blue-accent)] bg-[rgba(91,127,232,0.1)] px-2.5 py-0.5 rounded-[7px] inline-block">
                      {selectedWordbookItem.pronunciation}
                    </span>
                  )}
                  {selectedWordbookItem.styleTag && selectedWordbookItem.styleTag !== 'standard' && (
                    <span className={cn(
                      "inline-block px-2.5 py-0.5 rounded-[7px] font-mono-meta text-[10px] tracking-[0.15em] uppercase font-bold",
                      tagChipStyle(selectedWordbookItem.styleTag)
                    )}>
                      {selectedWordbookItem.styleTag === 'authentic' ? t.styleAuthentic : t.styleAcademic}
                    </span>
                  )}
                  <button
                    onClick={() => onSpeak(selectedWordbookItem.original)}
                    disabled={loadingAudioText === selectedWordbookItem.original}
                    className="p-1.5 text-[var(--blue-accent)] hover:bg-[rgba(91,127,232,0.08)] rounded-full transition-colors disabled:opacity-50"
                  >
                    {loadingAudioText === selectedWordbookItem.original ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <button
                onClick={() => onDeleteWord(selectedWordbookItem.id).then(() => setSelectedWordbookItem(null))}
                className="p-2.5 border border-[rgba(10,14,26,0.08)] rounded-[12px] text-[var(--ink-subtle)] bg-transparent hover:text-[var(--red-warn)] hover:bg-[rgba(229,56,43,0.06)] hover:border-[rgba(229,56,43,0.25)] transition-all shrink-0 flex items-center justify-center sm:w-auto w-full"
              >
                <Trash2 className="w-4 h-4" />
                <span className="sm:hidden ml-2 font-bold text-[13px]">{t.delete}</span>
              </button>
            </div>

            {/* Usage tabs */}
            <div className="flex flex-wrap gap-2 py-5">
              {(selectedWordbookItem.usages || []).map((usage, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedUsageIndex(idx);
                    setShowDetails(false);
                  }}
                  className={cn(
                    "px-3.5 py-2 rounded-[12px] border-[1.5px] font-zh-serif text-[13px] font-semibold cursor-pointer transition-all",
                    selectedUsageIndex === idx
                      ? "bg-[var(--ink)] border-[var(--ink)] text-white scale-[1.04] shadow-[0_4px_12px_rgba(10,14,26,0.2)]"
                      : "bg-white/50 border-[rgba(10,14,26,0.08)] text-[var(--ink-subtle)] hover:border-[rgba(91,127,232,0.4)] hover:text-[var(--blue-accent)]"
                  )}
                >
                  {uiLang === 'zh' ? usage.labelZh : usage.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <motion.div
              key={selectedUsageIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* Meaning section */}
              <div className="py-[18px]">
                <h4 className="font-mono-meta text-[10px] tracking-[0.2em] uppercase text-[var(--ink-subtle)] m-0 mb-2.5">
                  meaning · 释义
                </h4>
                <div className="p-[16px_18px] rounded-[14px] bg-white/50 border border-white/70">
                  <p className="font-zh-serif font-semibold text-[16px] text-[var(--ink)] m-0 mb-2">
                    {selectedWordbookItem.usages?.[selectedUsageIndex]?.meaning || ''}
                  </p>
                  <p className="font-zh-serif text-[15px] font-medium text-[var(--blue-accent)] m-0 pt-2 border-t border-[var(--ink-hairline)]">
                    {selectedWordbookItem.usages?.[selectedUsageIndex]?.meaningZh || ''}
                  </p>
                </div>
              </div>

              {/* Examples section */}
              <div className="py-[18px] border-t border-[var(--ink-hairline)]">
                <h4 className="font-mono-meta text-[10px] tracking-[0.2em] uppercase text-[var(--ink-subtle)] m-0 mb-2.5">
                  examples · {t.examples}
                </h4>
                <div className="flex flex-col gap-2.5">
                  {(selectedWordbookItem.usages[selectedUsageIndex]?.examples || []).map((ex, i) => (
                    <div key={i} className="p-[14px_16px] rounded-[13px] bg-white/50 border border-white/70">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-display italic text-[14px] leading-[1.6] text-[var(--ink)] m-0 flex-1">
                          <span className="font-bold text-[16px] text-[rgba(91,127,232,0.35)] mr-2 inline-block">{String(i + 1).padStart(2, '0')}</span>
                          "{ex.sentence}"
                        </p>
                        <button
                          onClick={() => onSpeak(ex.sentence)}
                          disabled={loadingAudioText === ex.sentence}
                          className="p-1.5 text-[var(--ink-subtle)] hover:text-[var(--blue-accent)] transition-colors shrink-0 disabled:opacity-50"
                        >
                          {loadingAudioText === ex.sentence ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <p className="font-zh-serif text-[12.5px] text-[var(--ink-muted)] m-0 mt-1.5 pl-6 border-l-2 border-[rgba(91,127,232,0.2)]">{ex.translation}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Details toggle */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="inline-flex items-center gap-1.5 font-display italic text-[13px] text-[var(--blue-accent)] hover:text-[var(--blue-accent-deep)] transition-colors mt-2"
              >
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
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
                    {selectedWordbookItem.usages?.[selectedUsageIndex]?.synonyms && selectedWordbookItem.usages?.[selectedUsageIndex]?.synonyms.length > 0 && (
                      <div className="py-[18px] border-t border-[var(--ink-hairline)]">
                        <h4 className="font-mono-meta text-[10px] tracking-[0.2em] uppercase text-[var(--ink-subtle)] m-0 mb-2.5">
                          synonyms · {t.synonyms}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedWordbookItem.usages?.[selectedUsageIndex]?.synonyms.map((syn, i) => (
                            <span key={i} className="px-[11px] py-[5px] rounded-[9px] bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)] font-display italic text-[13px] font-medium border border-[rgba(91,127,232,0.2)] cursor-pointer hover:bg-[rgba(91,127,232,0.2)] transition-colors">
                              {syn}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedWordbookItem.usages?.[selectedUsageIndex]?.alternatives && selectedWordbookItem.usages?.[selectedUsageIndex]?.alternatives.length > 0 && (
                      <div className="py-[18px] border-t border-[var(--ink-hairline)]">
                        <h4 className="font-mono-meta text-[10px] tracking-[0.2em] uppercase text-[var(--ink-subtle)] m-0 mb-2.5">
                          alternatives · {t.alternatives}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedWordbookItem.usages?.[selectedUsageIndex]?.alternatives.map((alt, i) => (
                            <span key={i} className="px-[11px] py-[5px] rounded-[9px] bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)] font-display italic text-[13px] font-medium border border-[rgba(91,127,232,0.2)]">
                              {alt}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Antonyms — 红色反义词 chip。字段可能不存在，用 any 兜底。 */}
                    {(() => {
                      const usage: any = selectedWordbookItem.usages?.[selectedUsageIndex] || {};
                      const antonyms: string[] = Array.isArray(usage.antonyms) ? usage.antonyms : [];
                      if (antonyms.length === 0) return null;
                      return (
                        <div className="py-[18px] border-t border-[var(--ink-hairline)]">
                          <h4 className="font-mono-meta text-[10px] tracking-[0.2em] uppercase font-bold text-[var(--ink-soft)] m-0 mb-2.5">
                            {uiLang === 'zh' ? 'antonyms · 反义词' : 'antonyms'}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {antonyms.map((w: string) => (
                              <span
                                key={w}
                                className="inline-block px-3 py-1 rounded-full font-display italic text-[13px] bg-[rgba(229,56,43,0.08)] text-[var(--red-warn)] border border-[rgba(229,56,43,0.2)]"
                              >
                                {w}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Word forms — 紫色词形变化 chip。字段缺失时不渲染。 */}
                    {(() => {
                      const usage: any = selectedWordbookItem.usages?.[selectedUsageIndex] || {};
                      const forms: string[] = Array.isArray(usage.wordForms) ? usage.wordForms : [];
                      if (forms.length === 0) return null;
                      return (
                        <div className="py-[18px] border-t border-[var(--ink-hairline)]">
                          <h4 className="font-mono-meta text-[10px] tracking-[0.2em] uppercase font-bold text-[var(--ink-soft)] m-0 mb-2.5">
                            {uiLang === 'zh' ? 'word forms · 词形变化' : 'word forms'}
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {forms.map((w: string) => (
                              <span
                                key={w}
                                className="inline-block px-3 py-1 rounded-full font-display italic text-[13px] bg-[rgba(168,168,217,0.15)] text-[#7D6EA3] border border-[rgba(168,168,217,0.3)]"
                              >
                                {w}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </article>
        </motion.div>
      ) : savedWords.length === 0 ? (
        /* ======================== EMPTY STATE ======================== */
        <div className="surface !rounded-[18px] text-center py-20 border-dashed">
          <BookOpen className="w-12 h-12 text-[var(--ink-subtle)] mx-auto mb-4" />
          <p className="font-zh-serif text-[15px] text-[var(--ink-muted)] font-medium m-0">{t.emptyWordbook}</p>
          <p className="font-display italic text-[13px] text-[var(--ink-subtle)] mt-2">
            {uiLang === 'zh' ? '翻译单词后点击保存，就会出现在这里' : 'Translate a word and save it to see it here'}
          </p>
        </div>
      ) : (
        /* ======================== LIST VIEW ======================== */
        <div className="space-y-4">
          {/* Eyebrow */}
          <div className="flex items-baseline gap-[10px] mb-[14px] pl-[4px]">
            <span style={{ width: '18px', height: '1px', background: 'var(--ink-rule)', transform: 'translateY(-4px)' }} />
            <span className="font-display italic text-[13px] text-[var(--ink-muted)]">wordbook</span>
            <span className="font-zh-sans text-[11.5px] tracking-[0.12em] text-[var(--ink-subtle)]">
              {uiLang === 'zh' ? '单词本' : 'saved words'}
            </span>
          </div>

          {/* Layout grid — 对齐 wordbook.html 原型:
              桌面 >=768px: 左侧 folder panel (固定 200px) + 右侧列表 (1fr)
              移动端: 单列, folder 降级成横向 chip 行 (保留现有实现) */}
          <div className="grid md:grid-cols-[200px_1fr] gap-4 items-start">
            {/* ========== LEFT: Folder panel (桌面端) ========== */}
            <aside className="hidden md:block surface !rounded-[14px] p-[18px_18px_16px] sticky top-[90px]">
              <h4 className="flex items-baseline gap-[10px] m-0 mb-3">
                <span className="font-display italic text-[13px] text-[var(--ink-muted)]">— folders</span>
                <span className="font-zh-sans text-[10px] font-light tracking-[0.15em] text-[var(--ink-subtle)]">
                  {uiLang === 'zh' ? '文件夹' : ''}
                </span>
              </h4>
              <div className="flex flex-col gap-1 mb-3">
                <button
                  onClick={() => onSetActiveFolder(null)}
                  className={cn(
                    "flex justify-between items-center px-3 py-2.5 rounded-[12px] font-zh-serif text-[14px] transition-colors text-left",
                    !activeFolderId
                      ? "bg-[rgba(91,127,232,0.1)] text-[var(--ink)] font-bold border-l-[3px] border-l-[var(--blue-accent)] pl-[9px]"
                      : "text-[rgba(10,14,26,0.7)] hover:bg-[rgba(10,14,26,0.04)] hover:text-[var(--ink)]"
                  )}
                >
                  <span>{uiLang === 'zh' ? '全部' : 'All'}</span>
                  <span className="font-mono-meta text-[11px] text-[var(--ink-subtle)]">{savedWords.length}</span>
                </button>
                {folders.map(folder => {
                  const count = Object.values(wordFolderMap).filter(fid => fid === folder.id).length;
                  const isActive = activeFolderId === folder.id;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => onSetActiveFolder(isActive ? null : folder.id)}
                      className={cn(
                        "flex justify-between items-center px-3 py-2.5 rounded-[12px] font-zh-serif text-[14px] transition-colors text-left",
                        isActive
                          ? "bg-[rgba(91,127,232,0.1)] text-[var(--ink)] font-bold border-l-[3px] border-l-[var(--blue-accent)] pl-[9px]"
                          : "text-[rgba(10,14,26,0.7)] hover:bg-[rgba(10,14,26,0.04)] hover:text-[var(--ink)]"
                      )}
                    >
                      <span className="truncate">{folder.name}</span>
                      <span className="font-mono-meta text-[11px] text-[var(--ink-subtle)] shrink-0 ml-2">{count}</span>
                    </button>
                  );
                })}
              </div>
              {showFolderCreate ? (
                <div className="flex items-center gap-1 bg-white border border-[rgba(91,127,232,0.4)] rounded-[10px] px-2 py-1">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder={uiLang === 'zh' ? '文件夹名' : 'Folder name'}
                    className="flex-1 min-w-0 font-zh-serif text-[13px] outline-none bg-transparent"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') { setShowFolderCreate(false); setNewFolderName(''); }
                    }}
                  />
                  <button onClick={handleCreateFolder} className="text-[#2F6317] shrink-0"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setShowFolderCreate(false); setNewFolderName(''); }} className="text-[var(--ink-muted)] shrink-0"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button
                  onClick={() => setShowFolderCreate(true)}
                  className="inline-flex items-center gap-1.5 font-display italic text-[13px] text-[var(--blue-accent)] hover:text-[var(--blue-accent-deep)] transition-colors"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  {uiLang === 'zh' ? '+ 新建文件夹' : '+ new folder'}
                </button>
              )}
            </aside>

            {/* ========== RIGHT: Toolbar + filters + cards ========== */}
            <div className="min-w-0 space-y-4">

          {/* Toolbar row */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <div className="flex-1 inline-flex items-center gap-2.5 px-[14px] py-2.5 bg-white border border-[var(--border-solid)] rounded-[12px] focus-within:border-[var(--blue-accent)] focus-within:shadow-[0_0_0_3px_rgba(91,127,232,0.15)] transition-all">
              <Search className="w-4 h-4 text-[var(--ink-subtle)] shrink-0" />
              <input
                type="text"
                placeholder={uiLang === 'zh' ? 'search your words · 查找单词或释义' : 'search your words'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent border-0 outline-none font-zh-serif text-[14px] text-[var(--ink)] placeholder:font-display placeholder:italic placeholder:text-[var(--ink-subtle)]"
              />
            </div>
            <button
              onClick={() => { setBatchMode(!batchMode); setSelectedWordIds(new Set()); }}
              className={cn(
                "px-4 py-2.5 rounded-[12px] font-zh-serif text-[13px] font-semibold transition-all border cursor-pointer",
                batchMode
                  ? "bg-[var(--ink)] border-[var(--ink)] text-white"
                  : "bg-white border-[var(--border-solid)] text-[var(--ink-body)] hover:border-[rgba(91,127,232,0.4)]"
              )}
            >
              {uiLang === 'zh' ? '批量整理' : 'Batch'}
            </button>
          </div>

          {/* Folder bar — mobile only; 桌面端已经有左侧 folder-panel */}
          <div className="md:hidden flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => onSetActiveFolder(null)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] font-zh-serif text-[13px] transition-all border whitespace-nowrap",
                !activeFolderId
                  ? "bg-[rgba(91,127,232,0.12)] text-[var(--blue-accent)] font-bold border-[rgba(91,127,232,0.25)]"
                  : "bg-white border-[var(--ink-hairline)] text-[var(--ink-muted)] hover:bg-[rgba(10,14,26,0.04)] hover:border-[rgba(91,127,232,0.4)]"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {uiLang === 'zh' ? '全部' : 'All'}
              <span className="font-mono-meta text-[11px] text-[var(--ink-subtle)] ml-1">{savedWords.length}</span>
            </button>
            {folders.map(folder => {
              const count = Object.values(wordFolderMap).filter(fid => fid === folder.id).length;
              return (
                <div key={folder.id} className="relative">
                  {editingFolderId === folder.id ? (
                    <div className="flex items-center gap-1 bg-white border border-[rgba(91,127,232,0.4)] rounded-[10px] px-2 py-1">
                      <input
                        type="text"
                        value={editFolderName}
                        onChange={(e) => setEditFolderName(e.target.value)}
                        className="w-24 font-zh-serif text-[13px] outline-none bg-transparent"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { onRenameFolder(folder.id, editFolderName); setEditingFolderId(null); }
                          if (e.key === 'Escape') setEditingFolderId(null);
                        }}
                      />
                      <button onClick={() => { onRenameFolder(folder.id, editFolderName); setEditingFolderId(null); }} className="text-[#2F6317]"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingFolderId(null)} className="text-[var(--ink-muted)]"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSetActiveFolder(activeFolderId === folder.id ? null : folder.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] font-zh-serif text-[13px] transition-all border whitespace-nowrap group",
                        activeFolderId === folder.id
                          ? "bg-[rgba(91,127,232,0.1)] text-[var(--ink)] font-bold border-l-[3px] border-l-[var(--blue-accent)] border-[rgba(91,127,232,0.1)]"
                          : "bg-white border-[var(--ink-hairline)] text-[var(--ink-muted)] hover:border-[rgba(91,127,232,0.4)]"
                      )}
                    >
                      {activeFolderId === folder.id ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
                      {folder.name}
                      <span className="font-mono-meta text-[11px] text-[var(--ink-subtle)] ml-1">{count}</span>
                      <span
                        onClick={(e) => { e.stopPropagation(); setFolderMenuId(folderMenuId === folder.id ? null : folder.id); }}
                        className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  )}
                  {folderMenuId === folder.id && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-[var(--ink-hairline)] rounded-[12px] shadow-lg z-20 py-1 min-w-[120px]">
                      <button
                        onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); setFolderMenuId(null); }}
                        className="w-full text-left px-3 py-2 font-zh-serif text-[12px] font-medium text-[var(--ink-body)] hover:bg-[rgba(10,14,26,0.04)] flex items-center gap-2"
                      >
                        <Pencil className="w-3 h-3" /> {uiLang === 'zh' ? '重命名' : 'Rename'}
                      </button>
                      <button
                        onClick={() => { onDeleteFolder(folder.id); setFolderMenuId(null); }}
                        className="w-full text-left px-3 py-2 font-zh-serif text-[12px] font-medium text-[var(--red-warn)] hover:bg-[rgba(229,56,43,0.06)] flex items-center gap-2"
                      >
                        <Trash2 className="w-3 h-3" /> {uiLang === 'zh' ? '删除' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {showFolderCreate ? (
              <div className="flex items-center gap-1 bg-white border border-[rgba(91,127,232,0.4)] rounded-[10px] px-2 py-1">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={uiLang === 'zh' ? '文件夹名' : 'Folder name'}
                  className="w-24 font-zh-serif text-[13px] outline-none bg-transparent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') { setShowFolderCreate(false); setNewFolderName(''); }
                  }}
                />
                <button onClick={handleCreateFolder} className="text-[#2F6317]"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setShowFolderCreate(false); setNewFolderName(''); }} className="text-[var(--ink-muted)]"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button
                onClick={() => setShowFolderCreate(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] font-display italic text-[13px] border border-dashed border-[var(--ink-rule)] text-[var(--blue-accent)] hover:border-[rgba(91,127,232,0.4)] transition-all whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                {uiLang === 'zh' ? '+ 新建文件夹' : '+ new folder'}
              </button>
            )}
          </div>

          {/* Style filter */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: uiLang === 'zh' ? '全部 · all' : 'all · 全部' },
              { id: 'authentic', label: 'Authentic' },
              { id: 'academic', label: 'Academic' },
              { id: 'standard', label: uiLang === 'zh' ? '标准' : 'Standard' },
              { id: 'slang', label: uiLang === 'zh' ? '梗' : 'Slang' }
            ].map((filter) => (
              <button
                key={filter.id}
                onClick={() => setWordbookFilter(filter.id as any)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full font-display italic text-[13px] transition-all border",
                  wordbookFilter === filter.id
                    ? "bg-[var(--ink)] border-[var(--ink)] text-white shadow-[0_3px_8px_rgba(10,14,26,0.22)]"
                    : "bg-white/55 border-white/75 text-[rgba(10,14,26,0.7)] hover:text-[var(--ink)]"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Batch action bar */}
          {batchMode && selectedWordIds.size > 0 && (
            <div className="flex items-center gap-2.5 surface !rounded-[12px] border-l-[3px] border-l-[var(--blue-accent)] bg-[rgba(91,127,232,0.04)] p-[12px_18px]">
              <span className="font-display italic font-semibold text-[14px] text-[var(--blue-accent)]">
                {uiLang === 'zh' ? `已选 ${selectedWordIds.size} 个` : `${selectedWordIds.size} selected`}
              </span>
              <span className="w-px h-4 bg-[var(--ink-hairline)]" />
              <div className="relative">
                <button
                  onClick={() => setShowBatchMoveMenu(!showBatchMoveMenu)}
                  className="px-3 py-[7px] rounded-[10px] font-zh-serif text-[12px] font-semibold bg-[rgba(91,127,232,0.12)] border border-[rgba(91,127,232,0.3)] text-[var(--blue-accent)]"
                >
                  {uiLang === 'zh' ? '移动到文件夹 ▾' : 'Move to... ▾'}
                </button>
                {showBatchMoveMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-[var(--ink-hairline)] rounded-[12px] shadow-lg z-20 py-1 min-w-[140px]">
                    <button onClick={() => handleBatchMove(null)} className="w-full text-left px-3 py-2 font-zh-serif text-[12px] font-medium text-[var(--ink-body)] hover:bg-[rgba(10,14,26,0.04)]">
                      {uiLang === 'zh' ? '移出文件夹' : 'Remove from folder'}
                    </button>
                    {folders.map(f => (
                      <button key={f.id} onClick={() => handleBatchMove(f.id)} className="w-full text-left px-3 py-2 font-zh-serif text-[12px] font-medium text-[var(--ink-body)] hover:bg-[rgba(10,14,26,0.04)] flex items-center gap-2">
                        <Folder className="w-3 h-3" /> {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleBatchDelete}
                className="px-3 py-[7px] rounded-[10px] font-zh-serif text-[12px] font-semibold bg-[rgba(229,56,43,0.08)] border border-[rgba(229,56,43,0.25)] text-[var(--red-warn)] hover:bg-[rgba(229,56,43,0.14)]"
              >
                {uiLang === 'zh' ? '删除' : 'Delete'}
              </button>
              <button
                onClick={() => { setBatchMode(false); setSelectedWordIds(new Set()); }}
                className="ml-auto px-3 py-[7px] rounded-[10px] font-zh-serif text-[12px] font-semibold bg-transparent border border-[rgba(10,14,26,0.15)] text-[var(--ink-muted)]"
              >
                {uiLang === 'zh' ? '取消批量模式' : 'Cancel'}
              </button>
            </div>
          )}

          {/* Word cards grid */}
          <div className="grid grid-cols-1 gap-3.5">
            {folderFilteredWords.map((word) => (
              <motion.article
                layout
                key={word.id}
                onClick={() => batchMode ? toggleWordSelection(word.id) : setSelectedWordbookItem(word)}
                className={cn(
                  "surface !rounded-[14px] p-[18px_20px] cursor-pointer transition-all hover:!border-[var(--border-solid-strong)] hover:shadow-[0_4px_14px_rgba(10,14,26,0.06)] relative",
                  batchMode && "pl-[52px]"
                )}
              >
                {batchMode && (
                  <span
                    className={cn(
                      "absolute left-[18px] top-[22px] w-[22px] h-[22px] rounded-[7px] border-[1.5px] inline-flex items-center justify-center cursor-pointer transition-all",
                      selectedWordIds.has(word.id)
                        ? "bg-[var(--blue-accent)] border-[var(--blue-accent)] text-white"
                        : "border-[rgba(10,14,26,0.2)] bg-white/55"
                    )}
                  >
                    {selectedWordIds.has(word.id) && <Check className="w-3 h-3" strokeWidth={3} />}
                  </span>
                )}
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-[22px] tracking-[-0.025em] text-[var(--ink)] truncate">
                      <em className="italic text-[var(--blue-accent)] font-semibold">{word.original}</em>
                    </div>
                    {word.pronunciation && (
                      <div className="font-mono-meta text-[11.5px] text-[var(--ink-muted)] mt-1 tracking-[0.03em]">
                        {word.pronunciation}
                      </div>
                    )}
                  </div>
                  {word.styleTag && (
                    <span className={cn(
                      "inline-block px-2.5 py-[3px] rounded-full font-mono-meta text-[9.5px] tracking-[0.15em] uppercase font-bold shrink-0",
                      tagChipStyle(word.styleTag)
                    )}>
                      {word.styleTag === 'authentic' ? 'Authentic' : word.styleTag === 'academic' ? 'Academic' : 'Standard'}
                    </span>
                  )}
                </div>
                <p className="font-zh-sans font-medium text-[13.5px] leading-[1.8] text-[var(--ink-body)] tracking-[0.01em] m-0 mt-2.5 mb-3 line-clamp-3">
                  {word.usages?.[0]?.meaningZh || ''}
                </p>
                {word.usages?.[0]?.examples?.[0]?.sentence && (
                  <div className="font-display italic text-[13.5px] leading-[1.65] text-[var(--ink-body)] p-[10px_14px] bg-[rgba(10,14,26,0.04)] border-l-2 border-[var(--ink-rule)] rounded-[0_8px_8px_0] line-clamp-2">
                    "{word.usages[0].examples[0].sentence}"
                  </div>
                )}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-[var(--ink-hairline)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-meta text-[10.5px] font-semibold text-[var(--ink-muted)] tracking-[0.08em] uppercase">
                      {word.createdAt ? `SAVED ${word.createdAt.toDate().toISOString().slice(0, 10)}` : ''}
                    </span>
                    {(() => {
                      const meta = getSrsMeta(word);
                      return (
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <span className="font-mono-meta text-[10.5px] text-[var(--ink-subtle)]">·</span>
                          {meta.showDot && (
                            <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', meta.dotColor)} />
                          )}
                          <span className={`font-zh-serif text-[11px] font-semibold ${meta.color} truncate`}>
                            {meta.text}
                          </span>
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSpeak(word.original); }}
                      disabled={loadingAudioText === word.original}
                      className="w-7 h-7 rounded-[9px] inline-flex items-center justify-center bg-transparent text-[var(--ink-subtle)] hover:text-[var(--blue-accent)] hover:bg-[rgba(91,127,232,0.08)] transition-colors disabled:opacity-50"
                    >
                      {loadingAudioText === word.original ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {!batchMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteWord(word.id); }}
                        className="w-7 h-7 rounded-[9px] inline-flex items-center justify-center bg-transparent text-[var(--ink-subtle)] hover:text-[var(--red-warn)] hover:bg-[rgba(229,56,43,0.06)] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.article>
            ))}
          </div>

          {folderFilteredWords.length === 0 && (
            <div className="text-center py-12 font-zh-serif text-[14px] text-[var(--ink-muted)]">
              {activeFolderId
                ? (uiLang === 'zh' ? '该文件夹为空' : 'This folder is empty')
                : (uiLang === 'zh' ? '没有找到匹配的单词' : 'No matching words found')}
            </div>
          )}
            </div>
            {/* /RIGHT column */}
          </div>
          {/* /Layout grid (folder-panel + right column) */}
        </div>
      )}
    </div>
  );
}
