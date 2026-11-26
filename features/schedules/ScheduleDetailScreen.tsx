"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SectionState, type SectionStatus } from "@lib/shared/six-state";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { usePatientContext } from "@features/patient-context";
import { useDeleteSchedule, usePatchSchedule, useSchedule } from "./hooks";

export function ScheduleDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ctx = usePatientContext();
  const patientId = ctx?.patientId ?? "";
  const s = useSchedule(id);
  const patch = usePatchSchedule(patientId);
  const del = useDeleteSchedule(patientId);
  const [error, setError] = useState<string | null>(null);
  const [excDate, setExcDate] = useState("");
  const [excKind, setExcKind] = useState<"skip" | "time-override">("skip");
  const [excTime, setExcTime] = useState("08:00");

  const d = s.data;
  const status: SectionStatus = s.isPending
    ? "loading"
    : s.isError
      ? "error"
      : "ready";

  async function addException() {
    if (!d || !excDate) return;
    setError(null);
    try {
      const exceptions = [
        ...d.exceptions.map((e) => ({
          date: e.date,
          kind: e.kind,
          ...(e.timeOverride ? { time: e.timeOverride } : {}),
        })),
        {
          date: excDate,
          kind: excKind,
          ...(excKind === "time-override" ? { time: excTime } : {}),
        },
      ];
      await patch.mutateAsync({ id, patch: { exceptions } });
      setExcDate("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function removeException(date: string, kind: string) {
    if (!d) return;
    setError(null);
    try {
      await patch.mutateAsync({
        id,
        patch: {
          exceptions: d.exceptions
            .filter((e) => !(e.date === date && e.kind === kind))
            .map((e) => ({
              date: e.date,
              kind: e.kind,
              ...(e.timeOverride ? { time: e.timeOverride } : {}),
            })),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schedule</h1>
        <Button
          size="sm"
          variant="destructive"
          disabled={del.isPending}
          onClick={async () => {
            await del.mutateAsync(id);
            router.push("/medicines");
          }}
        >
          Delete
        </Button>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <SectionState status={status} onRetry={() => void s.refetch()}>
        {d ? (
          <>
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
              <div>
                <dt className="text-zinc-500">Recurrence</dt>
                <dd>
                  {d.recurrence.kind === "rrule"
                    ? d.recurrence.rrule
                    : `Dates: ${d.recurrence.dates.join(", ")}`}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Dose times</dt>
                <dd>{d.doseTimes.join(", ")}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Timezone</dt>
                <dd>{d.timezone}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Start</dt>
                <dd>{d.resolvedStartDate}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">End</dt>
                <dd>{d.endDate ?? "Never"}</dd>
              </div>
            </dl>

            <section className="flex flex-col gap-3">
              <h2 className="font-medium">Exceptions</h2>
              <ul className="flex flex-col gap-2" data-testid="exceptions">
                {d.exceptions.map((e) => (
                  <li
                    key={`${e.date}-${e.kind}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3 text-sm"
                  >
                    <span>
                      {e.date} — {e.kind}
                      {e.timeOverride ? ` @ ${e.timeOverride}` : ""}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void removeException(e.date, e.kind)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
                {d.exceptions.length === 0 ? (
                  <li className="text-sm text-zinc-500">No exceptions.</li>
                ) : null}
              </ul>
              <form
                className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-white p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addException();
                }}
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor="exc-date">Date</Label>
                  <Input
                    id="exc-date"
                    type="date"
                    required
                    value={excDate}
                    onChange={(e) => setExcDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="exc-kind">Kind</Label>
                  <select
                    id="exc-kind"
                    className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
                    value={excKind}
                    onChange={(e) =>
                      setExcKind(e.target.value as "skip" | "time-override")
                    }
                  >
                    <option value="skip">Skip this date</option>
                    <option value="time-override">Change time</option>
                  </select>
                </div>
                {excKind === "time-override" ? (
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="exc-time">New time</Label>
                    <Input
                      id="exc-time"
                      type="time"
                      required
                      value={excTime}
                      onChange={(e) => setExcTime(e.target.value)}
                    />
                  </div>
                ) : null}
                <Button type="submit" size="sm" disabled={patch.isPending}>
                  Add exception
                </Button>
              </form>
            </section>
          </>
        ) : null}
      </SectionState>
    </main>
  );
}
