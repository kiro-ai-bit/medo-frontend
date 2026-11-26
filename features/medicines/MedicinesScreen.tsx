"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PatientMedicineSummaryDto } from "@kiro-ai-bit/contracts";
import { SectionState, type SectionStatus } from "@lib/shared/six-state";
import { Button } from "@components/ui/button";
import { useConnectivity } from "@lib/state/client/connectivityStore";
import { medicineCache } from "@lib/offline/db/caches";
import { usePatientContext } from "@features/patient-context";
import { useMedicines } from "./hooks";

function MedicineRow({ m }: { m: PatientMedicineSummaryDto }) {
  return (
    <li>
      <Link
        href={`/medicines/${m.id}`}
        className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
      >
        <div>
          <p className="font-medium">{m.catalog.brandName}</p>
          <p className="text-sm text-zinc-500">
            {m.dosage} · {m.catalog.form} · {m.dosesRemaining} doses left
          </p>
        </div>
        <span className="text-xs text-zinc-400">
          {m.catalog.packagingQuantity}/pack
        </span>
      </Link>
    </li>
  );
}

export function MedicinesScreen() {
  const ctx = usePatientContext();
  const connectivity = useConnectivity();
  const router = useRouter();
  const patientId = ctx?.patientId ?? "";
  const q = useMedicines(patientId);
  const [cached, setCached] = useState<PatientMedicineSummaryDto[] | null>(
    null,
  );

  // Offline fallback: Dexie display slice when API fails in degraded mode.
  if (connectivity === "degraded" && q.isError && !cached) {
    void medicineCache.medicinesFor(patientId).then((rows) =>
      setCached(
        rows.map((r) => ({
          id: r.medicineId,
          patientId,
          catalogEntryId: "",
          catalog: {
            brandName: r.displayName,
            form: "other" as const,
            packagingQuantity: 1,
            photos: { A: r.photoUrl, B: null, C: null },
          },
          prescribingDoctor: "",
          dosage: r.dosage,
          dosesRemaining: r.dosesRemaining ?? 0,
          refillThreshold: 6,
          price: 0,
          pharmacyName: "",
          createdAt: r.fetchedAt,
        })),
      ),
    );
  }

  const rows = q.data ?? cached ?? [];
  const status: SectionStatus = q.isPending
    ? "loading"
    : q.isError && !cached
      ? "error"
      : rows.length === 0
        ? "empty"
        : "ready";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Medicines</h1>
        <Button size="sm" onClick={() => router.push("/medicines/new")}>
          Add medicine
        </Button>
      </header>
      <SectionState
        status={status}
        emptyMessage="No medicines yet. Add one to start scheduling doses."
        errorMessage={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
      >
        <ul className="flex flex-col gap-3" data-testid="medicine-list">
          {rows.map((m) => (
            <MedicineRow key={m.id} m={m} />
          ))}
        </ul>
      </SectionState>
    </main>
  );
}
