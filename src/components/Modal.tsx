import type { PropsWithChildren } from "react";
import { useDialogFocus } from "./useDialogFocus";

export function Modal({
  children,
  onClose,
  title,
  className = "",
}: PropsWithChildren<{ onClose?: () => void; title: string; className?: string }>) {
  const dialog = useDialogFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-label={title} aria-modal="true" className={`modal ${className}`} ref={dialog} role="dialog" tabIndex={-1}>
        <header className="modal-header"><h2>{title}</h2>{onClose && <button type="button" className="modal-close" aria-label="关闭弹窗" onClick={onClose}><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15"/></svg></button>}</header>
        {children}
      </section>
    </div>
  );
}
