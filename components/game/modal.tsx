"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Modal({
  children,
  title,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal native-modal ${wide ? "question-editor" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <button
        className="icon-button close-modal"
        aria-label="Fermer"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      {children}
    </dialog>
  );
}
