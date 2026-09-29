import type { PropsWithChildren } from "react";
import { useDialogFocus } from "./useDialogFocus";

export function Sheet({
  children,
  onClose,
  title,
}: PropsWithChildren<{ onClose?: () => void; title: string }>) {
  const dialog = useDialogFocus<HTMLElement>(onClose);

  return (
    <aside aria-label={title} aria-modal="true" className="sheet" ref={dialog} role="dialog" tabIndex={-1}>
      <h2>{title}</h2>
      {children}
    </aside>
  );
}
