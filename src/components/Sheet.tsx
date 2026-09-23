import { useEffect, type PropsWithChildren } from "react";

export function Sheet({
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
    <aside aria-label={title} className="sheet">
      <h2>{title}</h2>
      {children}
    </aside>
  );
}
