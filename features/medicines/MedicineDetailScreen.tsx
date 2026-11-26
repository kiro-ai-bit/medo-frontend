"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { scheduleDoseClient } from "@lib/api/schedule-dose";
import { isApiError } from "@lib/api/http/errors";
import { SectionState, type SectionStatus } from "@lib/shared/six-state";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { queryKeys } from "@lib/state/query/queryKeys";
import { usePatientContext } from "@features/patient-context";
import {
  useArchiveMedicine,
  useDeleteMedicine,
  useMedicine,
  usePatchMedicine,
} from "./hooks";

const OUTCOMES = [
  "",
  "unmarked",
  "taken-on-time",
  "taken-late",
  "skipped",
  "missed",
] as const;

export function MedicineDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ctx = usePatientContext();
  const patientId = ctx?.patientId ?? "";
  const med = useMedicine(id);
  const archive = useArchiveMedicine(patientId);
  const del = useDeleteMedicine(patientId);
  const patch = usePatchMedicine(patientId);
  const [outcome, setOutcome] = useState("");
  const [edit, setEdit] = useState({
    prescribingDoctor: "",
    dosage: "",
    dosesRemaining: "",
    refillThreshold: "",
    price: "",
    pharmacyName: "",
  });
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const history = useQuery({
    queryKey: queryKeys.doses(
      patientId,
      `${today.slice(0, 8)}01T00:00:00.000Z`,
      `${today}T23:59:59.999Z`,
      outcome || undefined,
    ),
    queryFn: () =>
      scheduleDoseClient.listDoses(
        patientId,
        `${today.slice(0, 8)}01T00:00:00.000Z`,
        `${today}T23:59:59.999Z`,
        outcome || undefined,
      ),
    enabled: !!patientId,
    select: (doses) => doses.filter((d) => d.medicineId === id),
  });

  const m = med.data;
  const status: SectionStatus = med.isPending
    ? "loading"
    : med.isError
      ? "error"
      : "ready";

  function startEdit() {
    if (!m) return;
    setEdit({
      prescribingDoctor: m.prescribingDoctor,
      dosage: m.dosage,
      dosesRemaining: String(m.dosesRemaining),
      refillThreshold: String(m.refillThreshold),
      price: String(m.price),
      pharmacyName: m.pharmacyName,
    });
    setEditing(true);
  }

  async function saveEdit() {
    setActionError(null);
    try {
      await patch.mutateAsync({
        id,
        patch: {
          prescribingDoctor: edit.prescribingDoctor,
          dosage: edit.dosage,
          dosesRemaining: Number(edit.dosesRemaining),
          refillThreshold: Number(edit.refillThreshold),
          price: Number(edit.price),
          pharmacyName: edit.pharmacyName,
        },
      });
      setEditing(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function onArchive() {
    setActionError(null);
    try {
      await archive.mutateAsync(id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Archive failed");
    }
  }

  async function onDelete() {
    setActionError(null);
    try {
      await del.mutateAsync(id);
      router.push("/medicines");
    } catch (e) {
      // 409 = dose records exist → fail-closed message (history preserved).
      setActionError(
        isApiError(e) && e.status === 409
          ? "Cannot delete: this medicine has dose records. Archive it instead — history is preserved."
          : e instanceof Error
            ? e.message
            : "Delete failed",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {m?.catalog.brandName ?? "Medicine"}
        </h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/schedules/new")}
          >
            New schedule
          </Button>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={startEdit}>
              Edit
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={archive.isPending || !!m?.archivedAt}
            onClick={() => void onArchive()}
          >
            Archive
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={del.isPending}
            onClick={() => void onDelete()}
          >
            Delete
          </Button>
        </div>
      </header>
      {m?.archivedAt ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Archived — dose history is preserved.
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      ) : null}
      <SectionState status={status} onRetry={() => void med.refetch()}>
        {m && !editing ? (
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <div>
              <dt className="text-zinc-500">Doctor</dt>
              <dd>{m.prescribingDoctor}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Dosage</dt>
              <dd>{m.dosage}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Doses remaining</dt>
              <dd>{m.dosesRemaining}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Refill alert at</dt>
              <dd>{m.refillThreshold} doses</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Price</dt>
              <dd>{m.price}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Pharmacy</dt>
              <dd>{m.pharmacyName}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Form</dt>
              <dd>{m.catalog.form}</dd>
            </div>
          </dl>
        ) : null}
        {editing ? (
          <form
            className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            {(
              [
                ["prescribingDoctor", "Prescribing doctor"],
                ["dosage", "Dosage"],
                ["dosesRemaining", "Doses remaining"],
                ["refillThreshold", "Refill alert at (doses left)"],
                ["price", "Price"],
                ["pharmacyName", "Pharmacy"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="flex flex-col gap-1">
                <Label htmlFor={k}>{label}</Label>
                <Input
                  id={k}
                  value={edit[k]}
                  onChange={(e) =>
                    setEdit((s) => ({ ...s, [k]: e.target.value }))
                  }
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={patch.isPending}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </SectionState>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Dose history</h2>
          <select
            aria-label="Outcome filter"
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o === "" ? "All outcomes" : o}
              </option>
            ))}
          </select>
        </div>
        <SectionState
          status={
            history.isPending
              ? "loading"
              : history.isError
                ? "error"
                : (history.data?.length ?? 0) === 0
                  ? "empty"
                  : "ready"
          }
          emptyMessage="No doses this month."
        >
          <ul className="flex flex-col gap-2" data-testid="dose-history">
            {(history.data ?? []).map((d) => (
              <li
                key={d.id}
                className="flex justify-between rounded-lg border border-zinc-200 bg-white p-3 text-sm"
              >
                <span>
                  {d.localDate} {d.doseTime}
                </span>
                <span className="text-zinc-600">{d.outcome}</span>
              </li>
            ))}
          </ul>
        </SectionState>
      </section>
    </main>
  );
}
