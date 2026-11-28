"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ModulePage } from "@/components/layout/module-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthenticatedApiClient } from "@/lib/api";
import { DocumentForm, ExpenseForm } from "@/components/forms/document-expense-forms";
import type { Kind, Row } from "./focused-record-shared";
import { config, text } from "./focused-record-shared";

export function FocusedRecordCreateWorkspace({ kind }: { kind: Kind }) {
  const { client, hasToken, hydrated } = useAuthenticatedApiClient();
  const router = useRouter();
  const current = config[kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parties, setParties] = useState<readonly Row[]>([]);

  useEffect(() => {
    if (hydrated && hasToken) {
      client
        .data<readonly Row[] | { items: readonly Row[] }>("master-data/parties")
        .then((res) => {
          if (Array.isArray(res)) {
            setParties(res);
          } else if (res && typeof res === "object" && "items" in res && Array.isArray(res.items)) {
            setParties(res.items);
          }
        })
        .catch(() => setParties([]));
    }
  }, [client, hasToken, hydrated]);

  async function create(body: Row) {
    if (!hydrated || !hasToken) {
      setError("AUTH_REQUIRED");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await client.data<Row>(current.endpoint, { method: "POST", body });
      const id = text(result, "id");
      if (!id) throw new Error("API không trả về ID bản ghi.");
      router.push(`/${kind}/${encodeURIComponent(id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể tạo ${current.singular}.`);
      setBusy(false);
    }
  }
  return (
    <ModulePage
      title={current.newTitle}
      description={`Nhập dữ liệu ${current.singular} theo form nghiệp vụ và lưu qua REST API.`}
      section={current.title}
    >
      <div className="flex max-w-4xl flex-col gap-6">
        <Button variant="ghost" asChild className="w-fit">
          <Link href={`/${kind}`}>
            <ArrowLeft data-icon="inline-start" />
            Quay lại danh sách
          </Link>
        </Button>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Không thể lưu bản ghi</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{current.newTitle}</CardTitle>
            <CardDescription>
              Danh mục tài khoản hiện vẫn theo form compatibility; backend master-data selector sẽ
              thay thế khi contract UI được công bố.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {kind === "documents" ? (
              <DocumentForm busy={busy} parties={parties} onSubmit={(body) => void create(body)} />
            ) : (
              <ExpenseForm busy={busy} parties={parties} onSubmit={(body) => void create(body)} />
            )}
          </CardContent>
        </Card>
      </div>
    </ModulePage>
  );
}
