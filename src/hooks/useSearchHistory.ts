import { useState, useEffect } from 'react';

const STORAGE_KEY = 'memeflow_search_history';
const MAX_HISTORY = 30;

export interface SearchHistoryItem {
  text: string;
  timestamp: number;
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const addToHistory = (text: string) => {
    if (!text.trim()) return;
    setHistory(prev => {
      const filtered = prev.filter(item => item.text !== text.trim());
      return [{ text: text.trim(), timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
    });
  };

  const removeFromHistory = (text: string) => {
    setHistory(prev => prev.filter(item => item.text !== text));
  };

  const clearHistory = () => {
    setHistory([]);
  };

  return { history, addToHistory, removeFromHistory, clearHistory };
}
