import type { PropsWithChildren } from "react";

export function Sheet({ children, title }: PropsWithChildren<{ title: string }>) {
  return <aside aria-label={title} className="sheet"><h2>{title}</h2>{children}</aside>;
}
