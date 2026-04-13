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
  // Folder props
  folders: WordbookFolder[];
  wordFolderMap: Record<string, string>; // wordId -> folderId
  activeFolderId: string | null;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onSetActiveFolder: (id: string | null) => void;
  onMoveWordsToFolder: (wordIds: string[], folderId: string | null) => void;
  onNavigateToTranslate?: () => void;
}

export default function WordbookPage(props: WordbookPageProps) {
  const {
    savedWords, filteredWords, searchQuery, setSearchQuery,
    wordbookFilter, setWordbookFilter, selectedWordbookItem, setSelectedWordbookItem,
    selectedUsageIndex, setSelectedUsageIndex, showDetails, setShowDetails,
    loadingAudioText, uiLang, onSpeak, onDeleteWord,
    folders, wordFolderMap, activeFolderId, onCreateFolder, onRenameFolder,
    onDeleteFolder, onSetActiveFolder, onMoveWordsToFolder, onNavigateToTranslate
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

  return (
    <div className="space-y-4">
      {selectedWordbookItem ? (
        /* ======================== DETAIL VIEW ======================== */
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
            className="flex items-center gap-2 text-rose-500 font-bold hover:text-rose-600 transition-colors mb-4"
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
                    <p className="text-lg sm:text-xl font-bold text-rose-500 mt-1">
                      {selectedWordbookItem.usages?.[selectedUsageIndex]?.meaningZh || ''}
                    </p>
                  </div>
                  <button
                    onClick={() => onSpeak(selectedWordbookItem.original)}
                    disabled={loadingAudioText === selectedWordbookItem.original}
                    className="p-2 text-rose-400 hover:bg-rose-50 rounded-full transition-colors self-start mt-2 disabled:opacity-50"
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
                    <span className="text-rose-500 font-mono font-medium bg-rose-50 px-3 py-1 rounded-lg text-xs sm:text-sm">
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
                {(selectedWordbookItem.usages || []).map((usage, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedUsageIndex(idx);
                      setShowDetails(false);
                    }}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-bold transition-all border-2",
                      selectedUsageIndex === idx
                        ? "bg-rose-500 border-blue-600 text-white shadow-lg shadow-rose-100 scale-105"
                        : "bg-white border-gray-100 text-gray-400 hover:border-rose-200 hover:text-blue-400"
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
                    <p className="text-gray-800 text-lg font-bold leading-relaxed">
                      {selectedWordbookItem.usages?.[selectedUsageIndex]?.meaning || ''}
                    </p>
                    <p className="text-rose-500 text-lg font-medium leading-relaxed border-t border-gray-100 pt-3">
                      {selectedWordbookItem.usages?.[selectedUsageIndex]?.meaningZh || ''}
                    </p>
                  </div>
                </div>

                {/* Details Toggle */}
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-2 text-rose-500 font-bold text-sm hover:text-rose-600 transition-colors"
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
                        {selectedWordbookItem.usages?.[selectedUsageIndex]?.synonyms && selectedWordbookItem.usages?.[selectedUsageIndex]?.synonyms.length > 0 && (
                          <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                              {t.synonyms}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedWordbookItem.usages?.[selectedUsageIndex]?.synonyms.map((syn, i) => (
                                <span key={i} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-medium">
                                  {syn}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedWordbookItem.usages?.[selectedUsageIndex]?.alternatives && selectedWordbookItem.usages?.[selectedUsageIndex]?.alternatives.length > 0 && (
                          <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                              {t.alternatives}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedWordbookItem.usages?.[selectedUsageIndex]?.alternatives.map((alt, i) => (
                                <span key={i} className="bg-rose-50 text-rose-500 px-3 py-1 rounded-lg text-sm font-medium">
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
                    {(selectedWordbookItem.usages[selectedUsageIndex]?.examples || []).map((ex, i) => (
                      <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 space-y-3 group/ex hover:border-rose-200 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex gap-4">
                            <span className="text-blue-200 font-black text-xl italic">{String(i + 1).padStart(2, '0')}</span>
                            <p className="text-gray-800 font-medium leading-relaxed text-lg">{ex.sentence}</p>
                          </div>
                          <button
                            onClick={() => onSpeak(ex.sentence)}
                            disabled={loadingAudioText === ex.sentence}
                            className="p-2 text-gray-300 hover:text-rose-400 transition-colors shrink-0 disabled:opacity-50"
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
        /* ======================== EMPTY STATE ======================== */
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
          <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-4" />
          <p className="text-gray-400 font-medium">{t.emptyWordbook}</p>
          <p className="text-gray-300 text-sm mt-2">
            {uiLang === 'zh' ? '翻译单词后点击保存，就会出现在这里' : 'Translate a word and save it to see it here'}
          </p>
          {onNavigateToTranslate && (
            <button onClick={onNavigateToTranslate} className="mt-4 px-4 py-2 bg-rose-500 text-white text-sm font-medium rounded-xl hover:bg-rose-600 transition-colors">
              {uiLang === 'zh' ? '去翻译' : 'Go Translate'}
            </button>
          )}
        </div>
      ) : (
        /* ======================== LIST VIEW ======================== */
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{t.wordbook}</h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t.search}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:border-rose-500 outline-none transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                    aria-label={uiLang === 'zh' ? '清除搜索' : 'Clear search'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                onClick={() => { setBatchMode(!batchMode); setSelectedWordIds(new Set()); }}
                className={cn(
                  "px-3 py-2 rounded-xl text-xs font-bold transition-all border",
                  batchMode ? "bg-rose-500 border-blue-600 text-white" : "bg-white border-gray-200 text-gray-500 hover:border-rose-200"
                )}
              >
                {uiLang === 'zh' ? '批量' : 'Batch'}
              </button>
            </div>
          </div>

          {/* Folder bar */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => onSetActiveFolder(null)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border whitespace-nowrap",
                !activeFolderId ? "bg-rose-500 border-blue-600 text-white" : "bg-white border-gray-100 text-gray-500 hover:border-rose-200"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {uiLang === 'zh' ? '全部' : 'All'}
              <span className="opacity-60">({savedWords.length})</span>
            </button>
            {folders.map(folder => {
              const count = Object.values(wordFolderMap).filter(fid => fid === folder.id).length;
              return (
                <div key={folder.id} className="relative">
                  {editingFolderId === folder.id ? (
                    <div className="flex items-center gap-1 bg-white border border-rose-300 rounded-lg px-2 py-1">
                      <input
                        type="text"
                        value={editFolderName}
                        onChange={(e) => setEditFolderName(e.target.value)}
                        className="w-24 text-xs outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { onRenameFolder(folder.id, editFolderName); setEditingFolderId(null); }
                          if (e.key === 'Escape') setEditingFolderId(null);
                        }}
                      />
                      <button onClick={() => { onRenameFolder(folder.id, editFolderName); setEditingFolderId(null); }} className="text-green-500"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingFolderId(null)} className="text-gray-400"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSetActiveFolder(activeFolderId === folder.id ? null : folder.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border whitespace-nowrap group",
                        activeFolderId === folder.id ? "bg-rose-500 border-blue-600 text-white" : "bg-white border-gray-100 text-gray-500 hover:border-rose-200"
                      )}
                    >
                      {activeFolderId === folder.id ? <FolderOpen className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
                      {folder.name}
                      <span className="opacity-60">({count})</span>
                      <span
                        onClick={(e) => { e.stopPropagation(); setFolderMenuId(folderMenuId === folder.id ? null : folder.id); }}
                        className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  )}
                  {/* Folder context menu */}
                  {folderMenuId === folder.id && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[120px]">
                      <button
                        onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); setFolderMenuId(null); }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Pencil className="w-3 h-3" /> {uiLang === 'zh' ? '重命名' : 'Rename'}
                      </button>
                      <button
                        onClick={() => { onDeleteFolder(folder.id); setFolderMenuId(null); }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="w-3 h-3" /> {uiLang === 'zh' ? '删除' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {showFolderCreate ? (
              <div className="flex items-center gap-1 bg-white border border-rose-300 rounded-lg px-2 py-1">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={uiLang === 'zh' ? '文件夹名' : 'Folder name'}
                  className="w-24 text-xs outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') { setShowFolderCreate(false); setNewFolderName(''); }
                  }}
                />
                <button onClick={handleCreateFolder} className="text-green-500"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => { setShowFolderCreate(false); setNewFolderName(''); }} className="text-gray-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button
                onClick={() => setShowFolderCreate(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-gray-300 text-gray-400 hover:border-rose-300 hover:text-rose-400 transition-all whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                {uiLang === 'zh' ? '新建' : 'New'}
              </button>
            )}
          </div>

          {/* Style Filter */}
          <div className="flex flex-wrap gap-2">
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
                    ? "bg-rose-500 border-blue-600 text-white shadow-md shadow-rose-100"
                    : "bg-white border-gray-100 text-gray-400 hover:border-rose-200 hover:text-blue-400"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Batch action bar */}
          {batchMode && selectedWordIds.size > 0 && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-100 rounded-xl p-3">
              <span className="text-xs font-bold text-rose-500">
                {uiLang === 'zh' ? `已选 ${selectedWordIds.size} 个` : `${selectedWordIds.size} selected`}
              </span>
              <div className="flex-1" />
              <div className="relative">
                <button
                  onClick={() => setShowBatchMoveMenu(!showBatchMoveMenu)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-rose-200 text-rose-500 hover:bg-rose-50"
                >
                  {uiLang === 'zh' ? '移动到...' : 'Move to...'}
                </button>
                {showBatchMoveMenu && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[140px]">
                    <button onClick={() => handleBatchMove(null)} className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      {uiLang === 'zh' ? '移出文件夹' : 'Remove from folder'}
                    </button>
                    {folders.map(f => (
                      <button key={f.id} onClick={() => handleBatchMove(f.id)} className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        <Folder className="w-3 h-3" /> {f.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={handleBatchDelete}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 border border-red-200 text-red-500 hover:bg-red-100"
              >
                {uiLang === 'zh' ? '批量删除' : 'Delete'}
              </button>
            </div>
          )}

          {/* Word cards — compact: only word + translation */}
          <div className="space-y-2">
            {folderFilteredWords.map((word) => (
              <motion.div
                layout
                key={word.id}
                className={cn(
                  "bg-white rounded-3xl border border-gray-100 hover:border-rose-200 transition-all shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] overflow-hidden border-l-4",
                  word.styleTag === 'authentic' ? "border-l-blue-500" : word.styleTag === 'academic' ? "border-l-purple-500" : "border-l-gray-200"
                )}
              >
                <div
                  onClick={() => batchMode ? toggleWordSelection(word.id) : setSelectedWordbookItem(word)}
                  className="flex items-center gap-3 px-4 py-3.5 cursor-pointer"
                >
                  {batchMode && (
                    <span className="shrink-0">
                      {selectedWordIds.has(word.id) ? (
                        <CheckSquare className="w-5 h-5 text-rose-500" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300" />
                      )}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {word.interval != null && (
                        <span className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          word.interval > 21 ? "bg-green-400" : word.interval > 0 ? "bg-yellow-400" : "bg-red-400"
                        )} title={word.interval > 21 ? (uiLang === 'zh' ? '已掌握' : 'Mastered') : word.interval > 0 ? (uiLang === 'zh' ? '学习中' : 'Learning') : (uiLang === 'zh' ? '该复习了' : 'Due for review')} />
                      )}
                      <h3 className="text-base font-bold text-gray-900 truncate">{word.original}</h3>
                      {word.styleTag && word.styleTag !== 'standard' && (
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0",
                          word.styleTag === 'authentic' ? "bg-rose-100 text-rose-500" : "bg-purple-100 text-purple-600"
                        )}>
                          {word.styleTag === 'authentic' ? t.styleAuthentic : t.styleAcademic}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-0.5">{word.usages?.[0]?.meaningZh || ''}</p>
                    {(word.authenticTranslation || word.academicTranslation) && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">→ {(word.authenticTranslation || word.academicTranslation || '').slice(0, 60)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSpeak(word.original); }}
                      disabled={loadingAudioText === word.original}
                      className="p-1.5 text-gray-300 hover:text-rose-400 transition-colors disabled:opacity-50"
                    >
                      {loadingAudioText === word.original ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                    {!batchMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteWord(word.id); }}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {!batchMode && <ChevronRight className="w-4 h-4 text-gray-300" />}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {folderFilteredWords.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              {activeFolderId
                ? (uiLang === 'zh' ? '该文件夹为空' : 'This folder is empty')
                : (uiLang === 'zh' ? '没有找到匹配的单词' : 'No matching words found')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
