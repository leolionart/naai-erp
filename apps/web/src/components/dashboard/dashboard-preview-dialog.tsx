"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DashboardPreview = Readonly<{
  title: string;
  description: string;
  sourceIds: readonly string[];
  href: string;
  facts?: readonly Readonly<{ label: string; value: string }>[];
}>;

export function DashboardPreviewDialog({
  preview,
  onClose,
}: {
  preview?: DashboardPreview | undefined;
  onClose(): void;
}) {
  return (
    <Dialog
      open={Boolean(preview)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{preview?.title ?? "Nguồn dashboard"}</DialogTitle>
          <DialogDescription>{preview?.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {preview?.facts?.length ? (
            <dl className="grid gap-3">
              {preview.facts.map((fact) => (
                <div key={fact.label} className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="tabular-nums">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {preview?.sourceIds.length ? (
            <>
              <p className="text-sm font-medium">Source IDs</p>
              <div className="flex flex-wrap gap-2">
                {preview.sourceIds.map((id) => (
                  <Badge variant="outline" key={id} className="max-w-full break-all">
                    {id}
                  </Badge>
                ))}
              </div>
            </>
          ) : null}
          {preview ? (
            <Button asChild>
              <Link href={preview.href}>Mở trang drill-down đầy đủ</Link>
            </Button>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
