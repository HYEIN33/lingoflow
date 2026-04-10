import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db } from '../firebase';
import { SavedWord } from '../App';

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

export function useWordbook(user: User | null) {
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [wordbookFilter, setWordbookFilter] = useState<'all' | 'authentic' | 'academic' | 'standard'>('all');
  const [selectedWordbookItem, setSelectedWordbookItem] = useState<SavedWord | null>(null);

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
  };
}
