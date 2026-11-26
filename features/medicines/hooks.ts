"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CatalogEntryDto,
  CreateCatalogEntryRequest,
  CreateMedicineRequest,
  PatchCatalogEntryRequest,
  PatchMedicineRequest,
  PatientMedicineDetailDto,
} from "@kiro-ai-bit/contracts";
import { medicineClient } from "@lib/api/medicine";
import { queryClient } from "@lib/state/query/queryClient";
import { queryKeys } from "@lib/state/query/queryKeys";
import { medicineCache, doseCache } from "@lib/offline/db/caches";

export function useMedicines(patientId: string) {
  return useQuery({
    queryKey: queryKeys.medicines(patientId),
    queryFn: async () => {
      const medicines = await medicineClient.listMedicines(patientId);
      await medicineCache.upsertMedicines(
        medicines.map((m) => ({
          medicineId: m.id,
          patientId: m.patientId,
          displayName: m.catalog.brandName,
          dosage: m.dosage,
          photoUrl:
            m.catalog.photos.A ?? m.catalog.photos.B ?? m.catalog.photos.C,
          dosesRemaining: m.dosesRemaining,
          archived: false,
          fetchedAt: new Date().toISOString(),
        })),
      );
      return medicines;
    },
    enabled: patientId.length > 0,
  });
}

export function useMedicine(id: string) {
  return useQuery({
    queryKey: queryKeys.medicine(id),
    queryFn: () => medicineClient.getMedicine(id),
    enabled: id.length > 0,
  });
}

function invalidatePatient(patientId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["medicines", patientId] }),
    queryClient.invalidateQueries({ queryKey: ["doses", patientId] }),
    queryClient.invalidateQueries({ queryKey: ["schedules", patientId] }),
  ]);
}

export function useCreateMedicine(patientId: string) {
  return useMutation({
    mutationFn: (input: Omit<CreateMedicineRequest, "patientId">) =>
      medicineClient.createMedicine({ ...input, patientId }),
    onSuccess: () => invalidatePatient(patientId),
  });
}

export function usePatchMedicine(patientId: string) {
  return useMutation({
    mutationFn: (input: { id: string; patch: PatchMedicineRequest }) =>
      medicineClient.patchMedicine(input.id, input.patch),
    onSuccess: () => invalidatePatient(patientId),
  });
}

export function useArchiveMedicine(patientId: string) {
  return useMutation({
    mutationFn: (id: string) => medicineClient.archiveMedicine(id),
    onSuccess: () => invalidatePatient(patientId),
  });
}

export function useDeleteMedicine(patientId: string) {
  return useMutation({
    mutationFn: (id: string) => medicineClient.deleteMedicine(id),
    onSuccess: async () => {
      await invalidatePatient(patientId);
      await doseCache.purgePatient(patientId);
    },
  });
}

export function useCatalogSearch(q: string, page = 1) {
  return useQuery({
    queryKey: queryKeys.catalog(q, page),
    queryFn: () => medicineClient.searchCatalog(q || undefined, page),
  });
}

export function useCatalogEntry(id: string | null) {
  return useQuery({
    queryKey: queryKeys.catalogEntry(id ?? ""),
    queryFn: () => medicineClient.getCatalogEntry(id!),
    enabled: !!id,
  });
}

export function useCreateCatalogEntry() {
  return useMutation({
    mutationFn: (input: CreateCatalogEntryRequest) =>
      medicineClient.createCatalogEntry(input),
    onSuccess: (entry: CatalogEntryDto) => {
      queryClient.setQueryData(queryKeys.catalogEntry(entry.id), entry);
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

export function usePatchCatalogEntry() {
  return useMutation({
    mutationFn: (input: { id: string; patch: PatchCatalogEntryRequest }) =>
      medicineClient.patchCatalogEntry(input.id, input.patch),
    onSuccess: (entry: CatalogEntryDto) => {
      queryClient.setQueryData(queryKeys.catalogEntry(entry.id), entry);
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

export function useUploadCatalogPhoto() {
  return useMutation({
    mutationFn: (input: {
      entryId: string;
      slot: "A" | "B" | "C";
      file: File;
    }) => medicineClient.uploadPhoto(input.entryId, input.slot, input.file),
    onSuccess: (entry: CatalogEntryDto) => {
      queryClient.setQueryData(queryKeys.catalogEntry(entry.id), entry);
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

export type { PatientMedicineDetailDto };
