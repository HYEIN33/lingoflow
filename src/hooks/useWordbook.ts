import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db } from '../firebase';
import { SavedWord } from '../App';
import { WordbookFolder } from '../pages/WordbookPage';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const FOLDERS_KEY = 'memeflow_wordbook_folders';
const FOLDER_MAP_KEY = 'memeflow_word_folder_map';

export function useWordbook(user: User | null) {
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [wordbookFilter, setWordbookFilter] = useState<'all' | 'authentic' | 'academic' | 'standard'>('all');
  const [selectedWordbookItem, setSelectedWordbookItem] = useState<SavedWord | null>(null);

  // Folder state (localStorage-backed)
  const [folders, setFolders] = useState<WordbookFolder[]>(() => {
    try {
      const stored = localStorage.getItem(FOLDERS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [wordFolderMap, setWordFolderMap] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem(FOLDER_MAP_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  // Persist folders
  useEffect(() => {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  }, [folders]);
  useEffect(() => {
    localStorage.setItem(FOLDER_MAP_KEY, JSON.stringify(wordFolderMap));
  }, [wordFolderMap]);

  const createFolder = (name: string) => {
    const folder: WordbookFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      createdAt: Date.now()
    };
    setFolders(prev => [...prev, folder]);
  };

  const renameFolder = (id: string, name: string) => {
    if (!name.trim()) return;
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name: name.trim() } : f));
  };

  const deleteFolder = (id: string) => {
    setFolders(prev => prev.filter(f => f.id !== id));
    // Remove words from this folder
    setWordFolderMap(prev => {
      const next = { ...prev };
      for (const [wid, fid] of Object.entries(next)) {
        if (fid === id) delete next[wid];
      }
      return next;
    });
    if (activeFolderId === id) setActiveFolderId(null);
  };

  const moveWordsToFolder = (wordIds: string[], folderId: string | null) => {
    setWordFolderMap(prev => {
      const next = { ...prev };
      for (const wid of wordIds) {
        if (folderId) {
          next[wid] = folderId;
        } else {
          delete next[wid];
        }
      }
      return next;
    });
  };

  const filteredWords = savedWords.filter(word => {
    const matchesSearch = word.original.toLowerCase().includes(searchQuery.toLowerCase()) ||
      word.usages.some(u => u.meaningZh.includes(searchQuery));
    const matchesFilter = wordbookFilter === 'all' || word.styleTag === wordbookFilter;
    return matchesSearch && matchesFilter;
  });

  // Firestore Listener for Saved Words
  useEffect(() => {
    if (!user) {
      setSavedWords([]);
      return;
    }

    const path = 'words';
    console.log('Attaching onSnapshot listener for path:', path, 'userId:', user.uid);

    const q = query(
      collection(db, path),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('onSnapshot received update. Document count:', snapshot.size, 'Empty:', snapshot.empty);

      if (snapshot.empty) {
        console.log('No documents found for user:', user.uid);
        setSavedWords([]);
        return;
      }

      const words = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      }) as SavedWord[];

      // Sort in-memory instead of in the query
      const sortedWords = words.sort((a, b) => {
        const getTime = (t: any) => {
          if (!t) return 0;
          if (typeof t.toMillis === 'function') return t.toMillis();
          if (t instanceof Date) return t.getTime();
          if (t.seconds) return t.seconds * 1000;
          if (typeof t === 'number') return t;
          return 0;
        };
        return getTime(b.createdAt) - getTime(a.createdAt);
      });

      setSavedWords(sortedWords);
    }, (error) => {
      console.error('onSnapshot error:', error);
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDeleteWord = async (id: string) => {
    if (!user) return;
    const path = `words/${id}`;
    try {
      await deleteDoc(doc(db, 'words', id));
      // Also remove from folder map
      setWordFolderMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  return {
    savedWords,
    searchQuery,
    setSearchQuery,
    wordbookFilter,
    setWordbookFilter,
    filteredWords,
    selectedWordbookItem,
    setSelectedWordbookItem,
    handleDeleteWord,
    // Folder exports
    folders,
    wordFolderMap,
    activeFolderId,
    setActiveFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    moveWordsToFolder,
  };
}
