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
  return (
    <div className="select" ref={root}>
      <button aria-expanded={open} aria-haspopup="listbox" aria-label={label} className="select-control" onClick={() => setOpen(!open)} type="button">
        {selected?.label ?? "正在获取模型…"}<span aria-hidden="true">⌄</span>
      </button>
      {open && <div className="dropdown" role="listbox">
        {options.map((option) => <button aria-selected={option.value === value} className="dropdown-item" key={option.value} onClick={() => { onChange(option.value); setOpen(false); }} role="option" type="button">
          {option.label}<span>{option.value === value ? "✓" : ""}</span>
        </button>)}
      </div>}
    </div>
  );
}

export function SelectRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="select-row"><span>{label}</span>{children}</div>;
}
