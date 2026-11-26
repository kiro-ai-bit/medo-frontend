"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionState } from "@lib/shared/six-state";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { usePatientContext } from "@features/patient-context";
import { useMedicines } from "@features/medicines/hooks";
import { useCreateSchedule } from "./hooks";
import {
  buildRecurrence,
  browserTimezone,
  describeRecurrence,
  type RecurrenceKind,
} from "./recurrence";

const KINDS: { value: RecurrenceKind; label: string }[] = [
  { value: "once", label: "Specific dates" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];
const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export function ScheduleBuilderScreen() {
  const ctx = usePatientContext();
  const router = useRouter();
  const patientId = ctx?.patientId ?? "";
  const medicines = useMedicines(patientId);
  const create = useCreateSchedule(patientId);

  const [medicineId, setMedicineId] = useState("");
  const [kind, setKind] = useState<RecurrenceKind>("weekly");
  const [dates, setDates] = useState("");
  const [interval, setInterval_] = useState("1");
  const [byDay, setByDay] = useState<string[]>(["MO"]);
  const [doseTimes, setDoseTimes] = useState("08:00");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tz, setTz] = useState(browserTimezone());
  const [error, setError] = useState<string | null>(null);

  const recurrenceInput = {
    kind,
    dates: dates
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    interval: Number(interval) || 1,
    byDay,
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const times = doseTimes
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (times.length === 0)
        throw new Error("At least one dose time required");
      const res = await create.mutateAsync({
        medicineId,
        recurrence: buildRecurrence(recurrenceInput),
        doseTimes: times,
        timezone: tz,
        ...(startDate ? { startDate } : {}),
        endDate: endDate || null,
      });
      router.push(`/schedules/${res.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create schedule",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">New schedule</h1>
      <SectionState
        status={
          medicines.isPending
            ? "loading"
            : medicines.isError
              ? "error"
              : (medicines.data?.length ?? 0) === 0
                ? "empty"
                : "ready"
        }
        emptyMessage="Add a medicine first."
        onRetry={() => void medicines.refetch()}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="med">Medicine</Label>
            <select
              id="med"
              required
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
              value={medicineId}
              onChange={(e) => setMedicineId(e.target.value)}
            >
              <option value="">Select…</option>
              {(medicines.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.catalog.brandName} — {m.dosage}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="kind">Repeats</Label>
            <select
              id="kind"
              className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as RecurrenceKind)}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          {kind === "once" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="dates">Dates (yyyy-mm-dd, comma-separated)</Label>
              <Input
                id="dates"
                required
                placeholder="2026-12-01, 2026-12-05"
                value={dates}
                onChange={(e) => setDates(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor="interval">
                  Every N{" "}
                  {kind === "weekly"
                    ? "weeks"
                    : kind === "monthly"
                      ? "months"
                      : "years"}
                </Label>
                <Input
                  id="interval"
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval_(e.target.value)}
                />
              </div>
              {kind === "weekly" ? (
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-sm font-medium">Days</legend>
                  <div className="flex gap-2">
                    {WEEKDAYS.map((d) => (
                      <label
                        key={d}
                        className="flex items-center gap-1 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={byDay.includes(d)}
                          onChange={(e) =>
                            setByDay((s) =>
                              e.target.checked
                                ? [...s, d]
                                : s.filter((x) => x !== d),
                            )
                          }
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="times">Dose times (HH:MM, comma-separated)</Label>
            <Input
              id="times"
              required
              placeholder="08:00, 20:00"
              value={doseTimes}
              onChange={(e) => setDoseTimes(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="start">Start date (optional)</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="end">End date (optional)</Label>
              <Input
                id="end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="tz">Timezone</Label>
            <Input
              id="tz"
              required
              value={tz}
              onChange={(e) => setTz(e.target.value)}
            />
          </div>

          <p
            className="rounded-lg bg-zinc-100 p-3 text-sm"
            data-testid="rrule-preview"
          >
            {describeRecurrence(recurrenceInput)}
            {kind !== "once"
              ? ` — ${buildRecurrence(recurrenceInput).kind === "rrule" ? (buildRecurrence(recurrenceInput) as { rrule: string }).rrule : ""}`
              : ""}
          </p>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={create.isPending || !medicineId}>
            Create schedule
          </Button>
        </form>
      </SectionState>
    </main>
  );
}
