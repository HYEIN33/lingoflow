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
          "w-full py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all flex flex-col items-center justify-center gap-0.5 whitespace-nowrap px-3 select-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 relative",
          isActive
            ? "text-[#1D1D1F] bg-white/70 shadow-[var(--shadow-glass)]"
            : "text-[#86868B] hover:text-[#1D1D1F] hover:bg-white/30"
        )}
      >
        <span className="flex items-center gap-1.5">
          <tab.icon className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", isActive && "text-blue-600")} />
          {tab.label}
        </span>
        {isActive && <span className="w-1 h-1 rounded-full bg-gradient-to-r from-blue-600 to-indigo-500" />}
      </button>
    </div>
  );
}
