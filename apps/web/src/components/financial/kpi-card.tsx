import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function KpiCard({
  title,
  period,
  value,
  comparison,
  footer,
  loading = false,
}: Readonly<{
  title: string;
  period: string;
  value: ReactNode;
  comparison?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{period}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        )}
        {comparison ? <div className="mt-2 text-xs text-muted-foreground">{comparison}</div> : null}
      </CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  );
}
