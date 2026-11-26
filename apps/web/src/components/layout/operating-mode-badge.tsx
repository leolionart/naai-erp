"use client";

import { useEffect, useState } from "react";
import { UserRoundIcon, ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuthenticatedApiClient } from "@/lib/api";
import { describeOperatingMode } from "@/lib/operating-mode";

const CACHE_KEY = "naai-erp-operating-mode";

/** Shows which workflow the organization runs (solopreneur or controlled) on every page. */
export function OperatingModeBadge() {
  const { client, hasToken, hydrated } = useAuthenticatedApiClient();
  const [mode, setMode] = useState<string>();

  useEffect(() => {
    setMode(window.sessionStorage.getItem(CACHE_KEY) ?? undefined);
  }, []);

  useEffect(() => {
    if (!hydrated || !hasToken) return;
    let cancelled = false;
    client
      .data<{ operatingMode?: string }>("organization-workflow-policy")
      .then((policy) => {
        if (cancelled || !policy.operatingMode) return;
        setMode(policy.operatingMode);
        window.sessionStorage.setItem(CACHE_KEY, policy.operatingMode);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, hasToken, hydrated]);

  const info = describeOperatingMode(mode);
  if (!info) return null;
  const Icon = mode === "solopreneur" ? UserRoundIcon : ShieldCheckIcon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={mode === "solopreneur" ? "default" : "secondary"}
          data-testid="operating-mode-badge"
          className="gap-1"
        >
          <Icon className="size-3" aria-hidden="true" />
          Chế độ: {info.short}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium">{info.label}</p>
        <p>{info.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
