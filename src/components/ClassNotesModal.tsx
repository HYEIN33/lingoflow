/**
 * ClassNotesModal — the "我的笔记" drawer for the Classroom tab.
 *
 * What it does:
 *   - Lists the user's past classSessions (Firestore), newest first.
 *   - Lets them rename the auto-generated title, delete, and view the full
 *     bilingual transcript in a second-level modal.
 *   - Folders: users can create a folder, assign a session to it, and
 *     filter the list by folder. Schema mirrors the wordbook's folder
 *     model but in a separate namespace (classFolders collection).
 *
 * Why a modal (not a full page): the Classroom tab already owns most of
 * the user's attention. Pushing to a full route would mean a second mount
 * of startLiveSession side-effects. A modal keeps the session UI alive in
 * the background and reopens instantly.
 *
 * Everything here is best-effort: Firestore failures toast an error but
 * never block the UI. The list uses a lightweight onSnapshot subscription
 * so newly-saved sessions appear in real time when a class ends.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  BookText,
  X,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
  ChevronLeft,
  AlertTriangle,
} from 'lucide-react';

type UiLang = 'zh' | 'en';

interface ClassNotesModalProps {
  uiLang: UiLang;
  userId: string;
}

interface ClassSessionDoc {
  id: string;
  uid: string;
  title?: string;
  mode: 'tutorial' | 'lecture';
  audioSource: 'tab' | 'mic';
  startedAt?: Timestamp;
  endedAt?: Timestamp;
  transcript: string;
  folderId?: string | null;
}

interface ClassFolderDoc {
  id: string;
  uid: string;
  name: string;
}

function defaultTitle(transcript: string, zh: boolean): string {
  const firstLine = transcript.split(/\n/).map((s) => s.trim()).find(Boolean) || '';
  const trimmed = firstLine.length > 40 ? firstLine.slice(0, 40) + '…' : firstLine;
  if (trimmed) return trimmed;
  return zh ? '未命名笔记' : 'Untitled notes';
}

function formatDate(ts: Timestamp | undefined, zh: boolean): string {
  if (!ts) return zh ? '刚刚' : 'just now';
  const d = ts.toDate();
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return zh ? `今天 ${hh}:${mm}` : `Today ${hh}:${mm}`;
  const yyyy = d.getFullYear();
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mon}-${dd} ${hh}:${mm}`;
}

export default function ClassNotesModal({ uiLang, userId }: ClassNotesModalProps) {
  const zh = uiLang === 'zh';
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<ClassSessionDoc[]>([]);
  const [folders, setFolders] = useState<ClassFolderDoc[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | 'all' | 'unfiled'>('all');
  const [viewing, setViewing] = useState<ClassSessionDoc | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  // 待删除的 session (打开居中 confirm modal 时存起来；null = 不打开)
  const [pendingDelete, setPendingDelete] = useState<ClassSessionDoc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Live subscriptions while the modal is open — immediate updates on
  // save / delete / rename without any manual refresh. Closed → unsubscribe.
  useEffect(() => {
    if (!isOpen || !userId) return;
    const sRef = query(
      collection(db, 'classSessions'),
      where('uid', '==', userId),
      orderBy('startedAt', 'desc')
    );
    const fRef = query(
      collection(db, 'classFolders'),
      where('uid', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const unsubS = onSnapshot(
      sRef,
      (snap) => {
        const list: ClassSessionDoc[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as Omit<ClassSessionDoc, 'id'>;
          list.push({ id: docSnap.id, ...data });
        });
        setSessions(list);
      },
      (err) => {
        console.warn('[class-notes] sessions subscription failed:', err);
      }
    );
    const unsubF = onSnapshot(
      fRef,
      (snap) => {
        const list: ClassFolderDoc[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as Omit<ClassFolderDoc, 'id'>;
          list.push({ id: docSnap.id, ...data });
        });
        setFolders(list);
      },
      (err) => {
        console.warn('[class-notes] folders subscription failed:', err);
      }
    );
    return () => {
      unsubS();
      unsubF();
    };
  }, [isOpen, userId]);

  const visibleSessions = useMemo(() => {
    if (activeFolder === 'all') return sessions;
    if (activeFolder === 'unfiled') return sessions.filter((s) => !s.folderId);
    return sessions.filter((s) => s.folderId === activeFolder);
  }, [sessions, activeFolder]);

  const createFolder = async () => {
    const name = window.prompt(zh ? '新建文件夹名称' : 'New folder name');
    if (!name || !name.trim()) return;
    const trimmed = name.trim().slice(0, 80);
    if (folders.some((f) => f.name === trimmed)) {
      toast.info(zh ? '已有同名文件夹' : 'Folder already exists');
      return;
    }
    try {
      await addDoc(collection(db, 'classFolders'), {
        uid: userId,
        name: trimmed,
        createdAt: serverTimestamp(),
      });
      toast.success(zh ? '文件夹已创建' : 'Folder created');
    } catch (err) {
      console.warn('[class-notes] createFolder failed:', err);
      toast.error(zh ? '创建失败' : 'Could not create folder');
    }
  };

  const deleteFolder = async (folder: ClassFolderDoc) => {
    const confirmToast = () =>
      toast.warning(
        zh
          ? `删除文件夹「${folder.name}」？里面的笔记不会被删，只是回到「未分类」。`
          : `Delete folder "${folder.name}"? Notes inside go back to "Unfiled".`,
        {
          action: {
            label: zh ? '删除' : 'Delete',
            onClick: async () => {
              try {
                const affected = sessions.filter((s) => s.folderId === folder.id);
                await Promise.all(
                  affected.map((s) =>
                    updateDoc(doc(db, 'classSessions', s.id), { folderId: null })
                  )
                );
                await deleteDoc(doc(db, 'classFolders', folder.id));
                if (activeFolder === folder.id) setActiveFolder('all');
                toast.success(zh ? '文件夹已删除' : 'Folder deleted');
              } catch (err) {
                console.warn('[class-notes] deleteFolder failed:', err);
                toast.error(zh ? '删除失败' : 'Delete failed');
              }
            },
          },
          cancel: { label: zh ? '取消' : 'Cancel', onClick: () => {} },
          duration: 8000,
        }
      );
    confirmToast();
  };

  const saveTitle = async (s: ClassSessionDoc) => {
    const t = titleDraft.trim().slice(0, 120);
    setEditingTitleId(null);
    if (!t || t === s.title) return;
    try {
      await updateDoc(doc(db, 'classSessions', s.id), { title: t });
    } catch (err) {
      console.warn('[class-notes] saveTitle failed:', err);
      toast.error(zh ? '改名失败' : 'Rename failed');
    }
  };

  // 打开居中 confirm modal（对齐 modals.html 原型 .confirm-modal）。
  // 真正的 Firestore 删除在 executeDelete 里执行。
  const confirmDelete = (s: ClassSessionDoc) => {
    setPendingDelete(s);
  };

  const executeDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'classSessions', pendingDelete.id));
      toast.success(zh ? '已删除' : 'Deleted');
      if (viewing?.id === pendingDelete.id) setViewing(null);
      setPendingDelete(null);
    } catch (err) {
      console.warn('[class-notes] delete failed:', err);
      toast.error(zh ? '删除失败' : 'Delete failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const moveToFolder = async (s: ClassSessionDoc, folderId: string | null) => {
    try {
      await updateDoc(doc(db, 'classSessions', s.id), { folderId });
      toast.success(zh ? '已移动' : 'Moved');
    } catch (err) {
      console.warn('[class-notes] move failed:', err);
      toast.error(zh ? '移动失败' : 'Move failed');
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 text-[var(--ink-muted)] hover:text-[#5B7FE8] hover:bg-[rgba(91,127,232,0.08)] rounded-xl transition-colors"
        title={zh ? '我的笔记' : 'My notes'}
        aria-label={zh ? '我的笔记' : 'My notes'}
      >
        <BookText className="w-5 h-5" />
      </button>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
              onClick={() => {
                setViewing(null);
                setIsOpen(false);
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="glass-thick rounded-[28px] max-w-[680px] w-full max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {!viewing ? (
                  <>
                    {/* Head: icon badge + title + subtitle + close */}
                    <div className="flex items-center gap-3.5 px-6 py-5 border-b border-[var(--ink-hairline)]">
                      <div className="w-[38px] h-[38px] rounded-[12px] inline-flex items-center justify-center flex-shrink-0 bg-[rgba(91,127,232,0.12)] text-[var(--blue-accent)]">
                        <BookText className="w-[18px] h-[18px]" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="m-0 font-display font-bold text-[18px] tracking-[-0.02em] text-[var(--ink)]">
                          {zh ? '我的笔记 · Class Notes' : 'Class Notes · 我的笔记'}
                        </h2>
                        <div className="font-zh-serif text-[13px] text-[var(--ink-muted)] mt-0.5">
                          {(() => {
                            const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                            const weekNew = sessions.filter((s) => {
                              const ms = s.createdAt?.toMillis?.() ?? 0;
                              return ms >= oneWeekAgo;
                            }).length;
                            if (zh) {
                              return weekNew > 0
                                ? `共 ${sessions.length} 节课 · 本周新增 ${weekNew}`
                                : `共 ${sessions.length} 节课`;
                            }
                            return weekNew > 0
                              ? `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'} · ${weekNew} this week`
                              : `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`;
                          })()}
                        </div>
                      </div>
                      <button
                        onClick={() => setIsOpen(false)}
                        className="w-[34px] h-[34px] inline-flex items-center justify-center bg-transparent border-0 cursor-pointer text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[rgba(10,14,26,0.04)] rounded-[9px] transition-colors"
                        aria-label={zh ? '关闭' : 'Close'}
                      >
                        <X className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>

                    {/* Folder chips */}
                    <div className="px-6 py-3.5 border-b border-[var(--ink-hairline)] flex items-center gap-2 flex-wrap">
                      <FolderChip
                        active={activeFolder === 'all'}
                        onClick={() => setActiveFolder('all')}
                        label={zh ? `全部 · ${sessions.length}` : `All · ${sessions.length}`}
                      />
                      <FolderChip
                        active={activeFolder === 'unfiled'}
                        onClick={() => setActiveFolder('unfiled')}
                        label={zh ? '未分类' : 'Unfiled'}
                      />
                      {folders.map((f) => (
                        <FolderChip
                          key={f.id}
                          active={activeFolder === f.id}
                          onClick={() => setActiveFolder(f.id)}
                          onDelete={() => deleteFolder(f)}
                          label={f.name}
                        />
                      ))}
                      <button
                        onClick={createFolder}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 font-zh-serif text-[12.5px] border border-dashed border-[var(--ink-rule)] text-[var(--ink-subtle)] hover:text-[var(--blue-accent)] hover:border-[var(--blue-accent)] rounded-full transition-colors bg-white/55"
                      >
                        <FolderPlus className="w-3 h-3" strokeWidth={2.2} />
                        {zh ? '新建' : 'New'}
                      </button>
                    </div>

                    {/* Sessions list */}
                    <div className="flex-1 overflow-y-auto px-3.5 py-2 max-h-[400px]">
                      {visibleSessions.length === 0 ? (
                        <div className="text-center font-zh-serif text-[13px] text-[var(--ink-muted)] py-16 leading-[1.85]">
                          {zh
                            ? '还没有笔记。开始一节课并按「结束并保存笔记」，就会出现在这里。'
                            : 'No notes yet. Start a class and hit "Stop & save notes".'}
                        </div>
                      ) : (
                        visibleSessions.map((s, idx) => {
                          const title = s.title || defaultTitle(s.transcript, zh);
                          const isEditing = editingTitleId === s.id;
                          const excerpt = s.transcript
                            ? s.transcript.split(/\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' ')
                            : '';
                          return (
                            <div
                              key={s.id}
                              className={
                                'group px-4 py-3.5 rounded-[14px] flex gap-3.5 items-start cursor-pointer hover:bg-[rgba(91,127,232,0.05)] transition-colors ' +
                                (idx > 0 ? 'border-t border-[var(--ink-hairline)] rounded-none' : '')
                              }
                            >
                              <span className="flex-shrink-0 px-2 py-1 rounded-[7px] font-mono-meta text-[9px] font-extrabold tracking-[0.12em] text-[var(--blue-accent)] bg-[rgba(91,127,232,0.12)] mt-0.5 uppercase">
                                {s.audioSource === 'tab'
                                  ? (zh ? 'TAB · 整段' : 'TAB')
                                  : (zh ? 'MIC · 实时' : 'MIC')}
                              </span>

                              <div className="flex-1 min-w-0">
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    value={titleDraft}
                                    onChange={(e) => setTitleDraft(e.target.value)}
                                    onBlur={() => saveTitle(s)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveTitle(s);
                                      if (e.key === 'Escape') setEditingTitleId(null);
                                    }}
                                    className="w-full font-zh-serif font-semibold text-[14.5px] text-[var(--ink)] bg-transparent border-b border-[var(--blue-accent)] focus:outline-none mb-1"
                                  />
                                ) : (
                                  <button
                                    onClick={() => setViewing(s)}
                                    className="block text-left font-zh-serif font-semibold text-[14.5px] text-[var(--ink)] line-clamp-1 hover:text-[var(--blue-accent)] transition-colors mb-1 w-full"
                                  >
                                    {title}
                                  </button>
                                )}
                                {excerpt && (
                                  <p className="font-zh-serif text-[12.5px] text-[var(--ink-muted)] leading-[1.6] m-0 mb-1.5 line-clamp-2">
                                    {excerpt}
                                  </p>
                                )}
                                <div className="font-mono-meta text-[10.5px] text-[var(--ink-subtle)] flex items-center gap-2 flex-wrap">
                                  <span>{formatDate(s.startedAt, zh)}</span>
                                  {(() => {
                                    // 时长 = endedAt - startedAt（分钟）。没有 endedAt 就不显示。
                                    const startMs = s.startedAt?.toMillis?.() ?? 0;
                                    const endMs = s.endedAt?.toMillis?.() ?? 0;
                                    if (!startMs || !endMs || endMs <= startMs) return null;
                                    const minutes = Math.max(1, Math.round((endMs - startMs) / 60000));
                                    return (
                                      <>
                                        <span>·</span>
                                        <span>{zh ? `${minutes} 分钟` : `${minutes}m`}</span>
                                      </>
                                    );
                                  })()}
                                  <span>·</span>
                                  <span>
                                    {s.audioSource === 'tab'
                                      ? (zh ? '网课' : 'Online')
                                      : (zh ? '线下课' : 'In-person')}
                                  </span>
                                  {(() => {
                                    // 所属文件夹名称 —— 原型 meta-row 有"金融"tag
                                    if (!s.folderId) return null;
                                    const f = folders.find((fd) => fd.id === s.folderId);
                                    if (!f) return null;
                                    return (
                                      <>
                                        <span>·</span>
                                        <span className="text-[var(--blue-accent)]">{f.name}</span>
                                      </>
                                    );
                                  })()}
                                </div>

                                {folders.length > 0 && (
                                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                                    <span className="font-mono-meta text-[10px] text-[var(--ink-subtle)] uppercase tracking-[0.1em]">
                                      {zh ? '分到' : 'move to'}
                                    </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveToFolder(s, null);
                                      }}
                                      disabled={!s.folderId}
                                      className="font-zh-serif text-[11px] px-2 py-0.5 rounded-full bg-white/55 border border-[var(--ink-hairline)] text-[var(--ink-muted)] hover:border-[var(--ink-rule)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      {zh ? '未分类' : 'Unfiled'}
                                    </button>
                                    {folders.map((f) => (
                                      <button
                                        key={f.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveToFolder(s, f.id);
                                        }}
                                        disabled={s.folderId === f.id}
                                        className="font-zh-serif text-[11px] px-2 py-0.5 rounded-full bg-white/55 border border-[var(--ink-hairline)] text-[var(--ink-muted)] hover:border-[var(--ink-rule)] disabled:bg-[rgba(91,127,232,0.1)] disabled:text-[var(--blue-accent)] disabled:border-[rgba(91,127,232,0.25)] disabled:cursor-not-allowed transition-colors"
                                      >
                                        {f.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTitleDraft(title);
                                    setEditingTitleId(s.id);
                                  }}
                                  className="w-7 h-7 inline-flex items-center justify-center text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[rgba(10,14,26,0.06)] rounded-[8px] transition-colors"
                                  title={zh ? '重命名' : 'Rename'}
                                >
                                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    confirmDelete(s);
                                  }}
                                  className="w-7 h-7 inline-flex items-center justify-center text-[var(--ink-subtle)] hover:text-[var(--red-warn)] hover:bg-[rgba(229,56,43,0.08)] rounded-[8px] transition-colors"
                                  title={zh ? '删除' : 'Delete'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  // Transcript viewer
                  <>
                    <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--ink-hairline)]">
                      <button
                        onClick={() => setViewing(null)}
                        className="flex items-center gap-1 font-display italic text-[13px] text-[var(--blue-accent)] bg-transparent border-0 cursor-pointer px-1.5 py-1 hover:text-[var(--blue-accent-deep)] transition-colors"
                      >
                        <ChevronLeft className="w-3 h-3" strokeWidth={2} />
                        {zh ? '返回列表' : 'Back to list'}
                      </button>
                      {editingTitleId === viewing.id ? (
                        <input
                          autoFocus
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onBlur={() => { saveTitle(viewing); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { saveTitle(viewing); }
                            if (e.key === 'Escape') setEditingTitleId(null);
                          }}
                          className="flex-1 min-w-0 font-display font-bold text-[18px] tracking-[-0.02em] text-[var(--ink)] bg-transparent border-b border-[var(--blue-accent)] focus:outline-none"
                        />
                      ) : (
                        <h2 className="flex-1 min-w-0 m-0 font-display font-bold text-[18px] tracking-[-0.02em] text-[var(--ink)] truncate">
                          {viewing.title || defaultTitle(viewing.transcript, zh)}
                        </h2>
                      )}
                      {/* rename 铅笔 — 对齐 modals.html .d-head .rename */}
                      {editingTitleId !== viewing.id && (
                        <button
                          onClick={() => {
                            setTitleDraft(viewing.title || defaultTitle(viewing.transcript, zh));
                            setEditingTitleId(viewing.id);
                          }}
                          className="w-[34px] h-[34px] inline-flex items-center justify-center bg-transparent border-0 cursor-pointer text-[var(--ink-subtle)] hover:text-[var(--blue-accent)] hover:bg-[rgba(91,127,232,0.06)] rounded-[9px] transition-colors"
                          aria-label={zh ? '重命名' : 'Rename'}
                          title={zh ? '重命名' : 'Rename'}
                        >
                          <Pencil className="w-4 h-4" strokeWidth={1.8} />
                        </button>
                      )}
                      <button
                        onClick={() => setIsOpen(false)}
                        className="w-[34px] h-[34px] inline-flex items-center justify-center bg-transparent border-0 cursor-pointer text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[rgba(10,14,26,0.04)] rounded-[9px] transition-colors"
                        aria-label={zh ? '关闭' : 'Close'}
                      >
                        <X className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>
                    <div className="px-6 py-3 border-b border-[var(--ink-hairline)] bg-[rgba(10,14,26,0.02)] flex gap-3.5 flex-wrap font-zh-serif text-[13px] text-[var(--ink-soft)]">
                      <span>
                        <strong className="text-[var(--ink)] font-bold">
                          {formatDate(viewing.startedAt, zh)}
                        </strong>
                      </span>
                      {(() => {
                        const startMs = viewing.startedAt?.toMillis?.() ?? 0;
                        const endMs = viewing.endedAt?.toMillis?.() ?? 0;
                        if (!startMs || !endMs || endMs <= startMs) return null;
                        const minutes = Math.max(1, Math.round((endMs - startMs) / 60000));
                        return (
                          <>
                            <span>·</span>
                            <span>{zh ? `${minutes} 分钟` : `${minutes}m`}</span>
                          </>
                        );
                      })()}
                      <span>·</span>
                      <span>
                        {viewing.audioSource === 'tab'
                          ? (zh ? '浏览器标签音频' : 'Tab audio')
                          : (zh ? '麦克风' : 'Microphone')}
                      </span>
                      <span>·</span>
                      <span>
                        {viewing.mode === 'tutorial'
                          ? (zh ? '整段翻译' : 'Paragraph mode')
                          : (zh ? '实时翻译' : 'Realtime mode')}
                      </span>
                      {(() => {
                        if (!viewing.folderId) return null;
                        const f = folders.find((fd) => fd.id === viewing.folderId);
                        if (!f) return null;
                        return (
                          <>
                            <span>·</span>
                            <span className="text-[var(--blue-accent)]">{f.name}</span>
                          </>
                        );
                      })()}
                    </div>
                    <div className="px-6 py-5 overflow-y-auto flex-1">
                      {/* AI 笔记摘要 — 从 transcript 里挑前 3 条中文行当作"核心要点"。
                          对齐 modals.html 原型的 .summary 段，让用户一眼看到重点。
                          没有中文行就显示前 3 条非空行。 */}
                      {viewing.transcript && (() => {
                        const lines = viewing.transcript
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean);
                        const chinese = lines.filter((l) => /[\u4e00-\u9fa5]/.test(l));
                        const picks = (chinese.length >= 3 ? chinese : lines).slice(0, 3);
                        if (picks.length === 0) return null;
                        return (
                          <div className="mb-5 p-[14px_18px] rounded-[14px] border-l-[3px] border-l-[var(--blue-accent)] bg-[rgba(91,127,232,0.05)]">
                            <div className="font-mono-meta text-[10px] tracking-[0.22em] uppercase font-extrabold text-[var(--ink-soft)] mb-2">
                              — {zh ? 'AI 笔记 · 老师讲的核心' : 'AI notes · key points'}
                            </div>
                            <ul className="m-0 p-0 list-none space-y-1.5 font-zh-serif text-[13px] leading-[1.75] text-[var(--ink-body)]">
                              {picks.map((p, i) => (
                                <li key={i} className="flex gap-2">
                                  <span className="text-[var(--blue-accent)] shrink-0">·</span>
                                  <span>{p}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}

                      {/* 双语分色：纯英文行用英文 display italic + muted；中文或混合用常规 ink-body */}
                      {viewing.transcript ? (
                        <div className="font-zh-serif text-[13.5px] leading-[1.95] space-y-1">
                          {viewing.transcript.split('\n').map((line, i) => {
                            const trimmed = line.trim();
                            if (!trimmed) return <br key={i} />;
                            const hasAscii = /[a-zA-Z]/.test(trimmed);
                            const hasChinese = /[\u4e00-\u9fa5]/.test(trimmed);
                            const isEnglish = hasAscii && !hasChinese;
                            return (
                              <p
                                key={i}
                                className={isEnglish
                                  ? 'm-0 font-display italic text-[12.5px] text-[rgba(10,14,26,0.52)]'
                                  : 'm-0 text-[var(--ink-body)]'}
                              >
                                {trimmed}
                              </p>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="m-0 font-zh-serif text-[13.5px] text-[var(--ink-muted)]">
                          {zh ? '（空）' : '(empty)'}
                        </p>
                      )}

                      {/* Footer 三按钮：导出 PDF / 分享 / 删除 */}
                      <div className="mt-5 pt-4 border-t border-[var(--ink-hairline)] flex gap-2 flex-wrap">
                        <button
                          onClick={() => toast.info(zh ? 'PDF 导出即将开放' : 'PDF export coming soon')}
                          className="px-3.5 py-2 rounded-[10px] bg-transparent border border-[var(--ink-hairline)] text-[var(--ink-body)] font-zh-sans font-semibold text-[12.5px] hover:bg-[rgba(10,14,26,0.04)] inline-flex items-center gap-1.5"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          {zh ? '导出 PDF' : 'Export PDF'}
                        </button>
                        <button
                          onClick={() => {
                            if (navigator.share) {
                              navigator
                                .share({
                                  title: viewing.title || defaultTitle(viewing.transcript, zh),
                                  text: viewing.transcript?.slice(0, 200),
                                })
                                .catch(() => {});
                            } else {
                              toast.info(zh ? '分享即将开放' : 'Share coming soon');
                            }
                          }}
                          className="px-3.5 py-2 rounded-[10px] bg-transparent border border-[var(--ink-hairline)] text-[var(--ink-body)] font-zh-sans font-semibold text-[12.5px] hover:bg-[rgba(10,14,26,0.04)] inline-flex items-center gap-1.5"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                          {zh ? '分享给同学' : 'Share'}
                        </button>
                        <button
                          onClick={() => confirmDelete(viewing)}
                          className="ml-auto px-3.5 py-2 rounded-[10px] bg-[rgba(229,56,43,0.08)] border border-[rgba(229,56,43,0.2)] text-[var(--red-warn)] font-zh-sans font-semibold text-[12.5px] hover:bg-[rgba(229,56,43,0.14)] inline-flex items-center gap-1.5"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                          {zh ? '删除这节课' : 'Delete this session'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Delete confirm modal — 对齐 modals.html 原型 .confirm-modal:
          居中 glass-thick 卡 + 56px 红色图标 + em 斜体标题 + 双按钮 */}
      {createPortal(
        <AnimatePresence>
          {pendingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] flex items-center justify-center p-4"
              onClick={() => !isDeleting && setPendingDelete(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="glass-thick rounded-[28px] max-w-[400px] w-full p-[32px_32px_28px] text-center"
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
              >
                <div
                  className="inline-flex items-center justify-center mb-[18px]"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 17,
                    background: 'rgba(229,56,43,0.12)',
                    color: 'var(--red-warn)',
                  }}
                >
                  <AlertTriangle className="w-[26px] h-[26px]" strokeWidth={1.8} />
                </div>
                <h3 className="font-display font-semibold text-[20px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-2">
                  <em className="italic text-[var(--red-warn)]">
                    {zh ? '删除' : 'Delete'}
                  </em>
                  {zh ? ' 这节课笔记？' : ' this note?'}
                </h3>
                <p className="font-zh-serif text-[14px] leading-[1.85] text-[var(--ink-muted)] m-0 mb-6">
                  {zh
                    ? '这条笔记会永久删除，没法恢复。'
                    : 'This note will be permanently deleted. You cannot undo this.'}
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setPendingDelete(null)}
                    disabled={isDeleting}
                    className="px-5 py-2.5 rounded-[12px] bg-transparent border border-[var(--ink-rule)] text-[var(--ink-body)] font-zh-serif text-[14px] font-semibold hover:bg-[rgba(10,14,26,0.04)] disabled:opacity-50 transition-colors"
                  >
                    {zh ? '取消' : 'Cancel'}
                  </button>
                  <button
                    onClick={executeDelete}
                    disabled={isDeleting}
                    className="px-5 py-2.5 rounded-[12px] bg-[var(--red-warn)] text-white font-zh-serif text-[14px] font-bold hover:bg-[var(--red-deep)] disabled:opacity-50 shadow-[0_4px_12px_rgba(229,56,43,0.28)] transition-colors"
                  >
                    {isDeleting
                      ? (zh ? '删除中…' : 'Deleting…')
                      : (zh ? '删除' : 'Delete')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

function FolderChip({
  active,
  onClick,
  label,
  onDelete,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  onDelete?: () => void;
}) {
  return (
    <div
      className={
        'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-zh-serif text-[12.5px] transition-colors cursor-pointer border ' +
        (active
          ? 'bg-[var(--ink)] text-white border-[var(--ink)]'
          : 'bg-white/60 text-[var(--ink-body)] border-white/70 hover:border-[var(--ink-rule)]')
      }
      onClick={onClick}
    >
      <Folder className="w-3 h-3" strokeWidth={1.8} />
      {label}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={
            'ml-0.5 p-0.5 rounded-full transition-colors ' +
            (active ? 'hover:bg-[#1a2440]' : 'hover:bg-[rgba(10,14,26,0.08)]')
          }
          aria-label="Delete folder"
        >
          <X className="w-2.5 h-2.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
