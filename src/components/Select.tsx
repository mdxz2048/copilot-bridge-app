import { useEffect, useRef, useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange(value: T): void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const selected = options.find((option) => option.value === value);
  const focusOption = (index: number) => window.setTimeout(() => {
    const items = root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (items?.length) items[(index + items.length) % items.length]?.focus();
  }, 0);
  const restoreFocus = () => root.current?.querySelector<HTMLButtonElement>('.select-control')?.focus();
  return (
    <div className="select" ref={root} onKeyDown={event => {
      if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); restoreFocus(); }
      if (event.key === "Tab") setOpen(false);
    }}>
      <button aria-expanded={open} aria-haspopup="listbox" aria-label={label} className="select-control" onClick={() => setOpen(!open)} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); focusOption(Math.max(0, options.findIndex(option => option.value === value))); }
      }} type="button">
        {selected?.label ?? "正在获取模型…"}<span aria-hidden="true">⌄</span>
      </button>
      {open && <div className="dropdown" role="listbox" aria-label={label}>
        {!options.length && <div className="dropdown-item" role="status">暂无可用选项</div>}
        {options.map((option, index) => <button aria-selected={option.value === value} className="dropdown-item" key={option.value} onKeyDown={event => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); focusOption(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1)); }
        }} onClick={() => { onChange(option.value); setOpen(false); restoreFocus(); }} role="option" type="button">
          {option.label}<span>{option.value === value ? "✓" : ""}</span>
        </button>)}
      </div>}
    </div>
  );
}

export function SelectRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="select-row"><span>{label}</span>{children}</div>;
}
