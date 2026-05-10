import React, { useState, useRef } from 'react';
import { GripVertical } from 'lucide-react';

interface DragDropListProps<T> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number, dragHandleProps: DragHandleProps) => React.ReactNode;
  keyExtractor: (item: T) => string | number;
  className?: string;
}

interface DragHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  className: string;
  'aria-label': string;
}

export function DragDropList<T>({ items, onReorder, renderItem, keyExtractor, className = '' }: DragDropListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (dragItem.current === null || dragItem.current === dropIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }

    const newItems = [...items];
    const [draggedItem] = newItems.splice(dragItem.current, 1);
    newItems.splice(dropIndex, 0, draggedItem);
    
    onReorder(newItems);
    setDragIndex(null);
    setOverIndex(null);
    dragItem.current = null;
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
    dragItem.current = null;
  };

  // Touch support
  const touchStartY = useRef(0);
  const touchCurrentIndex = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent, index: number) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentIndex.current = index;
    dragItem.current = index;
    setDragIndex(index);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragItem.current === null) return;
    
    const touch = e.touches[0];
    const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
    
    for (const el of elements) {
      const indexAttr = el.getAttribute('data-drag-index');
      if (indexAttr !== null) {
        const idx = parseInt(indexAttr);
        if (!isNaN(idx)) {
          setOverIndex(idx);
          break;
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (dragItem.current !== null && overIndex !== null && dragItem.current !== overIndex) {
      const newItems = [...items];
      const [draggedItem] = newItems.splice(dragItem.current, 1);
      newItems.splice(overIndex, 0, draggedItem);
      onReorder(newItems);
    }
    
    setDragIndex(null);
    setOverIndex(null);
    dragItem.current = null;
    touchCurrentIndex.current = null;
  };

  return (
    <div className={`space-y-1 ${className}`} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {items.map((item, index) => {
        const isDragging = dragIndex === index;
        const isOver = overIndex === index && dragIndex !== index;

        const dragHandleProps: DragHandleProps = {
          onMouseDown: () => handleDragStart(index),
          onTouchStart: (e) => handleTouchStart(e, index),
          className: 'cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 p-1 rounded transition touch-none',
          'aria-label': `Seret untuk susun semula item ${index + 1}`,
        };

        return (
          <div
            key={keyExtractor(item)}
            data-drag-index={index}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`transition-all duration-150
              ${isDragging ? 'opacity-50 scale-[0.98]' : ''}
              ${isOver ? 'border-t-2 border-blue-500 pt-1' : ''}
            `}
          >
            {renderItem(item, index, dragHandleProps)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Default drag handle icon
 */
export const DragHandle: React.FC<DragHandleProps> = (props) => (
  <button type="button" {...props}>
    <GripVertical size={16} />
  </button>
);
