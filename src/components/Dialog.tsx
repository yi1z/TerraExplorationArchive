import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const node = ref.current,
      previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => {
      node?.close();
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"dialog " + (wide ? "wide" : "")}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-header">
        <div>
          <span className="eyebrow">TERRA / ARCHIVE TOOLS</span>
          <h2>{title}</h2>
        </div>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
