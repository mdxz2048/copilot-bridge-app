import type { PropsWithChildren } from "react";

export function Modal({ children, title }: PropsWithChildren<{ title: string }>) {
  return <div className="modal-backdrop" role="presentation"><section aria-modal="true" className="modal" role="dialog" aria-label={title}><h2>{title}</h2>{children}</section></div>;
}
