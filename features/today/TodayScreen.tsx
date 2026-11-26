"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { DoseSummaryDto } from "@kiro-ai-bit/contracts";
import type { CachedDose } from "@lib/offline/db/medoDb";
import { SectionState, type SectionStatus } from "@lib/shared/six-state";
import { useConnectivity } from "@lib/state/client/connectivityStore";
import {
  doseCache,
  medicineCache,
  scheduleCache,
} from "@lib/offline/db/caches";
import { useState } from "react";
import {
  LinkEndedBanner,
  PatientSwitcher,
  useCareLinks,
  useLinkEndWatch,
  usePatientContext,
} from "@features/patient-context";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { actorLabel } from "./actor";
import {
  NotificationBell,
  PushEnableCta,
  useReminderMetaSync,
} from "@features/notifications";
import { GamificationWidget } from "@features/gamification";
import {
  useMarkDose,
  useSnoozeDose,
  useTodayFanout,
  doseWindowLabel,
} from "./hooks";
import type { DoseWindow } from "./window";
import { Button } from "@components/ui/button";

interface DoseView {
  id: string;
  scheduleId: string;
  medicineId: string;
  localDate: string;
  doseTime: string;
  scheduledAt: string;
  outcome: string | null;
  skippedByUser: boolean;
  actorId: string | null;
}

function toDoseView(d: DoseSummaryDto | CachedDose): DoseView {
  if ("id" in d) {
    return {
      id: d.id,
      scheduleId: d.scheduleId,
      medicineId: d.medicineId,
      localDate: d.localDate,
      doseTime: d.doseTime,
      scheduledAt: d.scheduledAt,
      outcome: d.outcome === "unmarked" ? null : d.outcome,
      skippedByUser: d.skippedByUser,
      actorId: d.actorId,
    };
  }
  return {
    id: d.doseId,
    scheduleId: d.scheduleId,
    medicineId: d.medicineId,
    localDate: d.localDate,
    doseTime: d.doseTime,
    scheduledAt: d.scheduledAt,
    outcome: d.outcome,
    skippedByUser: d.skippedByUser,
    actorId: d.actorId,
  };
}

interface CardModel {
  doseId: string;
  doseTime: string;
  medicineName: string;
  dosage: string;
  window: DoseWindow;
  label: string;
  actorText: string | null;
}

function DoseCard({
  card,
  highlight,
  onTaken,
  onSkip,
  onSnooze,
  pending,
}: {
  card: CardModel;
  highlight: boolean;
  onTaken: () => void;
  onSkip: () => void;
  onSnooze: () => void;
  pending: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlight) {
      ref.current?.scrollIntoView?.({ block: "center" });
      ref.current?.focus?.();
    }
  }, [highlight]);
  const actionable = card.window !== "marked" && card.window !== "missed";
  return (
    <li
      ref={ref}
      tabIndex={highlight ? -1 : undefined}
      data-dose-id={card.doseId}
      data-highlight={highlight || undefined}
      className={`rounded-xl border bg-white p-4 ${highlight ? "ring-2 ring-amber-400 border-amber-300" : "border-zinc-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{card.medicineName}</p>
          <p className="text-sm text-zinc-500">
            {card.dosage} · {card.doseTime}
          </p>
        </div>
        <span
          className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
          data-testid="window-badge"
        >
          {card.label}
        </span>
      </div>
      {actionable ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={pending} onClick={onTaken}>
            Taken
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onSnooze}
          >
            Snooze
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onSkip}
          >
            Skip
          </Button>
        </div>
      ) : null}
      {card.actorText ? (
        <p className="mt-2 text-xs text-zinc-400" data-testid="actor-label">
          {card.actorText}
        </p>
      ) : null}
    </li>
  );
}

export function TodayScreen() {
  useLinkEndWatch();
  useReminderMetaSync();
  const ctx = usePatientContext();
  const connectivity = useConnectivity();
  const userId = useSessionStore((s) => s.userId);
  const links = useCareLinks();
  const params = useSearchParams();
  const focusDoseId = params.get("dose");
  const { doses } = useTodayFanout(ctx?.patientId ?? "");
  const mark = useMarkDose(ctx?.patientId ?? "");
  const snooze = useSnoozeDose(ctx?.patientId ?? "");
  const [cached, setCached] = useState<{
    doses: Awaited<ReturnType<typeof doseCache.dosesForRange>>;
    medicines: Awaited<ReturnType<typeof medicineCache.medicinesFor>>;
    schedules: Awaited<ReturnType<typeof scheduleCache.schedulesFor>>;
  } | null>(null);

  const patientId = ctx?.patientId ?? null;
  useEffect(() => {
    if (!patientId || connectivity !== "degraded" || !doses.isError) return;
    const from = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    void Promise.all([
      doseCache.dosesForRange(patientId, from, to),
      medicineCache.medicinesFor(patientId),
      scheduleCache.schedulesFor(patientId),
    ]).then(([d, m, s]) => setCached({ doses: d, medicines: m, schedules: s }));
  }, [patientId, connectivity, doses.isError]);

  if (!ctx) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <LinkEndedBanner />
        <h1 className="text-xl font-semibold">Today</h1>
        <PatientSwitcher />
      </main>
    );
  }

  const tzBySchedule = new Map(
    (doses.data?.schedules ?? cached?.schedules ?? []).map((s) => [
      "id" in s ? s.id : s.scheduleId,
      s.timezone,
    ]),
  );
  const medById = new Map(
    (doses.data?.medicines ?? cached?.medicines ?? []).map((m) =>
      "catalog" in m
        ? ([m.id, { name: m.catalog.brandName, dosage: m.dosage }] as const)
        : ([m.medicineId, { name: m.displayName, dosage: m.dosage }] as const),
    ),
  );
  const doseRows: (DoseSummaryDto | CachedDose)[] =
    doses.data?.doses ?? cached?.doses ?? [];
  const now = new Date();
  const cards: CardModel[] = doseRows.map((d) => {
    const v = toDoseView(d);
    const { window, label } = doseWindowLabel(
      v,
      tzBySchedule.get(v.scheduleId) ?? "UTC",
      now,
    );
    const med = medById.get(v.medicineId);
    return {
      doseId: v.id,
      doseTime: v.doseTime,
      medicineName: med?.name ?? "Medicine",
      dosage: med?.dosage ?? "",
      window,
      label,
      actorText: actorLabel(v.actorId, userId, links.data ?? []),
    };
  });

  const status: SectionStatus = doses.isPending
    ? "loading"
    : doses.isError && !cached
      ? "error"
      : cards.length === 0
        ? "empty"
        : "ready";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Today</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/care-links"
            className="text-sm text-zinc-600 hover:underline"
          >
            Care
          </Link>
          <NotificationBell />
          <GamificationWidget patientId={ctx.patientId} />
        </div>
      </header>
      <LinkEndedBanner />
      {doses.isSuccess || cached ? <PushEnableCta /> : null}
      <SectionState
        status={status}
        emptyMessage="No doses scheduled."
        errorMessage={
          doses.error instanceof Error ? doses.error.message : undefined
        }
        onRetry={() => void doses.refetch()}
      >
        <ul className="flex flex-col gap-3" data-testid="dose-list">
          {cards.map((c) => (
            <DoseCard
              key={c.doseId}
              card={c}
              highlight={focusDoseId === c.doseId}
              pending={mark.pending || snooze.pending}
              onTaken={() => void mark.taken(c.doseId, c.window)}
              onSkip={() => void mark.skip(c.doseId)}
              onSnooze={() => void snooze.snooze(c.doseId)}
            />
          ))}
        </ul>
      </SectionState>
      {connectivity === "degraded" ? (
        <p className="text-xs text-zinc-500" data-testid="offline-note">
          Offline — actions will sync when you reconnect.
        </p>
      ) : null}
    </main>
  );
}
