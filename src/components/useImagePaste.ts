import { useEffect, useRef, useState } from 'react';

function firstImage(list: DataTransferItemList | FileList | null | undefined): File | null {
  if (!list) return null;
  for (const item of Array.from(list as ArrayLike<DataTransferItem | File>)) {
    const file = 'getAsFile' in item ? (item.kind === 'file' ? item.getAsFile() : null) : item;
    if (file && file.type.startsWith('image/')) return file;
  }
  return null;
}

/**
 * Accept an image pasted anywhere on the page (Ctrl/Cmd+V) or dropped onto it.
 * Text pastes are left alone. Returns whether a file is being dragged over the page.
 */
export function useImagePaste(onImage: (file: File) => void, enabled = true): boolean {
  const cb = useRef(onImage);
  cb.current = onImage;
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    const onPaste = (e: ClipboardEvent) => {
      const file = firstImage(e.clipboardData?.items) ?? firstImage(e.clipboardData?.files);
      if (!file) return;
      e.preventDefault();
      cb.current(file);
    };
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = firstImage(e.dataTransfer?.files);
      if (file) cb.current(file);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [enabled]);

  return dragging;
}
