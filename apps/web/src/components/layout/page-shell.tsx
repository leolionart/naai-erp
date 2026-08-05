import type { ReactNode } from "react";
import { SkipLink } from "./skip-link";

export type PageShellProps = Readonly<{
  children: ReactNode;
  navigation?: ReactNode;
  banner?: ReactNode;
  className?: string;
  contentClassName?: string;
  mainId?: string;
}>;

export function PageShell({
  children,
  navigation,
  banner,
  className,
  contentClassName,
  mainId = "main-content",
}: PageShellProps) {
  return (
    <div className={["app-shell", className].filter(Boolean).join(" ")}>
      <SkipLink href={`#${mainId}`} />
      {navigation}
      <main
        className={["workspace", contentClassName].filter(Boolean).join(" ")}
        id={mainId}
        tabIndex={-1}
      >
        {banner}
        {children}
      </main>
    </div>
  );
}
