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

  const confirmDelete = (s: ClassSessionDoc) => {
    toast.warning(
      zh ? '确定删除这条笔记？无法恢复。' : 'Delete this note? This cannot be undone.',
      {
        action: {
          label: zh ? '删除' : 'Delete',
          onClick: async () => {
            try {
              await deleteDoc(doc(db, 'classSessions', s.id));
              toast.success(zh ? '已删除' : 'Deleted');
              if (viewing?.id === s.id) setViewing(null);
            } catch (err) {
              console.warn('[class-notes] delete failed:', err);
              toast.error(zh ? '删除失败' : 'Delete failed');
            }
          },
        },
        cancel: { label: zh ? '取消' : 'Cancel', onClick: () => {} },
        duration: 8000,
      }
    );
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
        className="p-2 text-gray-400 hover:text-[#5B7FE8] hover:bg-[rgba(91,127,232,0.08)] rounded-xl transition-colors"
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
              className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4"
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
                className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {!viewing ? (
                  <>
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <BookText className="w-5 h-5 text-[#5B7FE8]" />
                        <h2 className="font-black text-lg text-gray-900">
                          {zh ? '我的笔记' : 'My notes'}
                        </h2>
                      </div>
                      <button
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                        aria-label={zh ? '关闭' : 'Close'}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Folder chips */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                      <FolderChip
                        active={activeFolder === 'all'}
                        onClick={() => setActiveFolder('all')}
                        label={zh ? `全部 (${sessions.length})` : `All (${sessions.length})`}
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
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-[#5B7FE8] bg-[rgba(91,127,232,0.08)] hover:bg-[rgba(91,127,232,0.15)] rounded-full transition-colors"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        {zh ? '新建' : 'New'}
                      </button>
                    </div>

                    {/* Sessions list */}
                    <div className="flex-1 overflow-y-auto px-3 py-2">
                      {visibleSessions.length === 0 ? (
                        <div className="text-center text-gray-400 text-sm py-16 leading-relaxed">
                          {zh
                            ? '还没有笔记。开始一节课并按「结束并保存笔记」，就会出现在这里。'
                            : 'No notes yet. Start a class and hit "Stop & save notes".'}
                        </div>
                      ) : (
                        visibleSessions.map((s) => {
                          const title = s.title || defaultTitle(s.transcript, zh);
                          const isEditing = editingTitleId === s.id;
                          return (
                            <div
                              key={s.id}
                              className="group px-3 py-3 hover:bg-gray-50 rounded-xl"
                            >
                              <div className="flex items-start justify-between gap-2">
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
                                      className="w-full text-sm font-semibold text-gray-900 bg-transparent border-b border-[#5B7FE8] focus:outline-none"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => setViewing(s)}
                                      className="text-left font-semibold text-sm text-gray-900 line-clamp-1 hover:text-[#5B7FE8] transition-colors"
                                    >
                                      {title}
                                    </button>
                                  )}
                                  <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                                    <span>{formatDate(s.startedAt, zh)}</span>
                                    <span>·</span>
                                    <span>
                                      {s.audioSource === 'tab'
                                        ? (zh ? '网课' : 'Online')
                                        : (zh ? '线下课' : 'In-person')}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setTitleDraft(title);
                                      setEditingTitleId(s.id);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-[#5B7FE8] hover:bg-[rgba(91,127,232,0.08)] rounded-lg transition-colors"
                                    title={zh ? '重命名' : 'Rename'}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => confirmDelete(s)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title={zh ? '删除' : 'Delete'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              {folders.length > 0 && (
                                <div className="mt-2 flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] text-gray-400">
                                    {zh ? '分到：' : 'Move to:'}
                                  </span>
                                  <button
                                    onClick={() => moveToFolder(s, null)}
                                    disabled={!s.folderId}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {zh ? '未分类' : 'Unfiled'}
                                  </button>
                                  {folders.map((f) => (
                                    <button
                                      key={f.id}
                                      onClick={() => moveToFolder(s, f.id)}
                                      disabled={s.folderId === f.id}
                                      className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:bg-[rgba(91,127,232,0.1)] disabled:text-[#5B7FE8] disabled:cursor-not-allowed transition-colors"
                                    >
                                      {f.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                ) : (
                  // Transcript viewer
                  <>
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                      <button
                        onClick={() => setViewing(null)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-[#5B7FE8] transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        {zh ? '返回列表' : 'Back to list'}
                      </button>
                      <button
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                        aria-label={zh ? '关闭' : 'Close'}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="px-6 py-5 overflow-y-auto">
                      <h3 className="font-black text-gray-900 text-lg mb-1">
                        {viewing.title || defaultTitle(viewing.transcript, zh)}
                      </h3>
                      <div className="text-xs text-gray-400 mb-4">
                        {formatDate(viewing.startedAt, zh)}
                      </div>
                      <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
                        {viewing.transcript || (zh ? '（空）' : '(empty)')}
                      </pre>
                    </div>
                  </>
                )}
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
        'shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ' +
        (active ? 'bg-[#0A0E1A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
      }
      onClick={onClick}
    >
      <Folder className="w-3 h-3" />
      {label}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={
            'ml-1 p-0.5 rounded-full transition-colors ' +
            (active ? 'hover:bg-[#1a2440]' : 'hover:bg-gray-300')
          }
          aria-label="Delete folder"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
