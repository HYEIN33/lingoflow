import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../lib/utils';

export interface SortableTabProps {
  tab: { id: string; label: string; icon: any; count?: number };
  isActive: boolean;
  onSelect: () => void;
  isPro: boolean;
}

// Sortable tab — Pro users can long-press + drag to reorder. Non-Pro
// users get a normal button (no drag listeners attached).
export function SortableTab({ tab, isActive, onSelect, isPro }: SortableTabProps) {
  const sortable = useSortable({ id: tab.id, disabled: !isPro });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    zIndex: isDragging ? 20 : 1,
    touchAction: isPro ? 'none' : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex-1 min-w-0"
      {...attributes}
      {...listeners}
    >
      <button
        onClick={onSelect}
        className={cn(
          "w-full py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap px-3 select-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
          isActive
            ? "bg-white text-rose-500 shadow-[var(--shadow-card)] border border-white/80"
            : "text-stone-400 hover:text-stone-600 hover:bg-white/30"
        )}
      >
        <tab.icon className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", isActive && "text-rose-400")} />
        {tab.label} {tab.count !== undefined && <span className="hidden xs:inline text-[10px] opacity-60">({tab.count})</span>}
      </button>
    </div>
  );
}
