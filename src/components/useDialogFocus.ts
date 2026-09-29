import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus<T extends HTMLElement>(onClose?: () => void) {
  const dialog = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement;
    const focusable = () => [...element.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((item) => item.tabIndex >= 0
        && !item.closest("[hidden], [inert], [aria-hidden='true']"));
    (focusable()[0] ?? element).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const openDialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (openDialogs.item(openDialogs.length - 1) !== element) return;
      if (event.key === "Escape" && close.current) {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0] ?? element;
      const last = controls.at(-1) ?? element;
      if (!element.contains(document.activeElement)
        || (event.shiftKey && document.activeElement === first)
        || (!event.shiftKey && document.activeElement === last)
        || controls.length === 0) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  return dialog;
}
