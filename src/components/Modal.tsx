import type { PropsWithChildren } from "react";
import { useDialogFocus } from "./useDialogFocus";

export function Modal({
  children,
  onClose,
  title,
}: PropsWithChildren<{ onClose?: () => void; title: string }>) {
  const dialog = useDialogFocus<HTMLElement>(onClose);

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-label={title} aria-modal="true" className="modal" ref={dialog} role="dialog" tabIndex={-1}>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
