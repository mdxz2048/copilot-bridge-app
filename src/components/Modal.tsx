import { useEffect, type PropsWithChildren } from "react";

export function Modal({
  children,
  onClose,
  title,
}: PropsWithChildren<{ onClose?: () => void; title: string }>) {
  useEffect(() => {
    if (!onClose) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-label={title} aria-modal="true" className="modal" role="dialog">
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
