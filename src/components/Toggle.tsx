export function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange(checked: boolean): void }) {
  return <button aria-checked={checked} aria-label={label} className={`toggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} role="switch" type="button"><span /></button>;
}
