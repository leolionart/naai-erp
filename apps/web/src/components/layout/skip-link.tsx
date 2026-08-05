import type { AnchorHTMLAttributes } from "react";

export type SkipLinkProps = Readonly<AnchorHTMLAttributes<HTMLAnchorElement>>;

export function SkipLink({
  children = "Bỏ qua điều hướng",
  className,
  href = "#main-content",
  ...props
}: SkipLinkProps) {
  return (
    <a className={["skip-link", className].filter(Boolean).join(" ")} href={href} {...props}>
      {children}
    </a>
  );
}
