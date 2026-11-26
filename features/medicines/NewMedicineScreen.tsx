"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogEntryDto } from "@kiro-ai-bit/contracts";
import { SectionState } from "@lib/shared/six-state";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { PatientSwitcher, usePatientContext } from "@features/patient-context";
import {
  useCatalogEntry,
  useCatalogSearch,
  useCreateCatalogEntry,
  useCreateMedicine,
  useUploadCatalogPhoto,
} from "./hooks";

const FORMS = ["tablet", "capsule", "syrup", "injection", "drops", "other"];
const SLOTS = ["A", "B", "C"] as const;
const SLOT_LABEL: Record<(typeof SLOTS)[number], string> = {
  A: "Outer packaging",
  B: "Inner pack",
  C: "Naked dose",
};

function PhotoSlots({ entry }: { entry: CatalogEntryDto }) {
  const upload = useUploadCatalogPhoto();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500">
        Photos: A packaging, B inner pack, C naked dose. Missing slots are
        filled with the next-most-relevant photo.
      </p>
      <div className="flex gap-3">
        {SLOTS.map((slot) => (
          <label
            key={slot}
            className="flex flex-col items-center gap-1 rounded-lg border border-zinc-200 p-2 text-xs"
          >
            {entry.photos[slot] ? (
              <img
                src={entry.photos[slot]!}
                alt={`Slot ${slot}`}
                className="h-16 w-16 rounded object-cover"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded bg-zinc-100 text-zinc-400">
                {slot}
              </span>
            )}
            <span>{SLOT_LABEL[slot]}</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setMsg(`Uploading ${slot}…`);
                upload.mutate(
                  { entryId: entry.id, slot, file: f },
                  {
                    onSuccess: () => setMsg(`Slot ${slot} uploaded.`),
                    onError: (err) =>
                      setMsg(
                        `Slot ${slot} failed: ${err instanceof Error ? err.message : "error"}`,
                      ),
                  },
                );
                e.target.value = "";
              }}
            />
          </label>
        ))}
      </div>
      {msg ? <p className="text-xs text-zinc-600">{msg}</p> : null}
      {upload.isPending ? (
        <p className="text-xs text-zinc-500">Uploading…</p>
      ) : null}
    </div>
  );
}

function CatalogCreateForm({
  onCreated,
}: {
  onCreated: (e: CatalogEntryDto) => void;
}) {
  const create = useCreateCatalogEntry();
  const [f, setF] = useState({
    brandName: "",
    ingredients: "",
    form: "tablet",
    packagingQuantity: "1",
  });
  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            brandName: f.brandName,
            ingredientNames: f.ingredients
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            form: f.form as CatalogEntryDto["form"],
            packagingQuantity: Number(f.packagingQuantity),
          },
          { onSuccess: onCreated },
        );
      }}
    >
      <p className="text-sm font-medium">New catalog entry</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="brand">Brand name</Label>
          <Input
            id="brand"
            required
            value={f.brandName}
            onChange={(e) => setF({ ...f, brandName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ing">Ingredients (comma-separated)</Label>
          <Input
            id="ing"
            required
            value={f.ingredients}
            onChange={(e) => setF({ ...f, ingredients: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="form">Form</Label>
          <select
            id="form"
            className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"
            value={f.form}
            onChange={(e) => setF({ ...f, form: e.target.value })}
          >
            {FORMS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pack">Pack quantity</Label>
          <Input
            id="pack"
            type="number"
            min={1}
            required
            value={f.packagingQuantity}
            onChange={(e) => setF({ ...f, packagingQuantity: e.target.value })}
          />
        </div>
      </div>
      {create.isError ? (
        <p role="alert" className="text-sm text-red-600">
          {create.error instanceof Error ? create.error.message : "Failed"}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={create.isPending}>
        Create entry
      </Button>
    </form>
  );
}

export function NewMedicineScreen() {
  const ctx = usePatientContext();
  const router = useRouter();
  const patientId = ctx?.patientId ?? "";
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CatalogEntryDto | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const catalog = useCatalogSearch(q);
  const detail = useCatalogEntry(selected?.id ?? null);
  const entry = detail.data ?? selected;
  const createMed = useCreateMedicine(patientId);
  const [f, setF] = useState({
    prescribingDoctor: "",
    dosage: "",
    dosesRemaining: "",
    refillThreshold: "6",
    price: "",
    pharmacyName: "",
  });

  if (!ctx) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold">Add medicine</h1>
        <PatientSwitcher />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Add medicine</h1>

      {!entry ? (
        <section className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search catalog…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Catalog search"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreate((s) => !s)}
            >
              New entry
            </Button>
          </div>
          {showCreate ? (
            <CatalogCreateForm
              onCreated={(e) => {
                setSelected(e);
                setShowCreate(false);
              }}
            />
          ) : null}
          <SectionState
            status={
              catalog.isPending
                ? "loading"
                : catalog.isError
                  ? "error"
                  : (catalog.data?.entries.length ?? 0) === 0
                    ? "empty"
                    : "ready"
            }
            emptyMessage="No catalog entries found."
            onRetry={() => void catalog.refetch()}
          >
            <ul className="flex flex-col gap-2" data-testid="catalog-list">
              {(catalog.data?.entries ?? []).map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-left hover:bg-zinc-50"
                    onClick={() => setSelected(e)}
                  >
                    <p className="font-medium">{e.brandName}</p>
                    <p className="text-sm text-zinc-500">
                      {e.ingredientNames.join(", ")} · {e.form} · pack{" "}
                      {e.packagingQuantity}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </SectionState>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{entry.brandName}</h2>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Back
            </Button>
          </div>
          <PhotoSlots entry={entry} />
          <form
            className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMed.mutate(
                {
                  catalogEntryId: entry.id,
                  prescribingDoctor: f.prescribingDoctor,
                  dosage: f.dosage,
                  dosesRemaining: Number(f.dosesRemaining),
                  refillThreshold: Number(f.refillThreshold),
                  price: Number(f.price),
                  pharmacyName: f.pharmacyName,
                },
                { onSuccess: () => router.push("/medicines") },
              );
            }}
          >
            <p className="text-sm font-medium">Your details</p>
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
                  required
                  type={
                    k === "price" ||
                    k === "dosesRemaining" ||
                    k === "refillThreshold"
                      ? "number"
                      : "text"
                  }
                  min={
                    k === "dosesRemaining" || k === "refillThreshold"
                      ? 0
                      : undefined
                  }
                  step={k === "price" ? "0.01" : undefined}
                  value={f[k]}
                  onChange={(e) => setF({ ...f, [k]: e.target.value })}
                />
              </div>
            ))}
            {createMed.isError ? (
              <p role="alert" className="text-sm text-red-600">
                {createMed.error instanceof Error
                  ? createMed.error.message
                  : "Failed"}
              </p>
            ) : null}
            <Button type="submit" disabled={createMed.isPending}>
              Add medicine
            </Button>
          </form>
        </section>
      )}
    </main>
  );
}
