import {
  ArchiveMedicineResponseSchema,
  CatalogEntryDtoSchema,
  CatalogListResponseSchema,
  CreateCatalogEntryRequestSchema,
  CreateMedicineRequestSchema,
  DeleteMedicineResponseSchema,
  IssuePhotoRequestSchema,
  IssuePhotoResponseSchema,
  ListMedicinesResponseSchema,
  PatientMedicineDetailDtoSchema,
  PatchCatalogEntryRequestSchema,
  PatchMedicineRequestSchema,
  type CatalogEntryDto,
  type CatalogListResponse,
  type CreateCatalogEntryRequest,
  type CreateMedicineRequest,
  type IssuePhotoRequest,
  type IssuePhotoResponse,
  type PatchCatalogEntryRequest,
  type PatchMedicineRequest,
  type PatientMedicineDetailDto,
  type PatientMedicineSummaryDto,
} from "@kiro-ai-bit/contracts";
import { apiFetch } from "../http/apiFetch";
import { ApiError } from "../http/errors";

export const medicineClient = {
  async listMedicines(patientId: string): Promise<PatientMedicineSummaryDto[]> {
    const res = await apiFetch(
      { method: "GET", path: `/v1/medicines?patientId=${patientId}` },
      ListMedicinesResponseSchema,
    );
    return res.medicines;
  },

  async getMedicine(id: string): Promise<PatientMedicineDetailDto> {
    return apiFetch(
      { method: "GET", path: `/v1/medicines/${id}` },
      PatientMedicineDetailDtoSchema,
    );
  },

  async createMedicine(
    input: CreateMedicineRequest,
  ): Promise<PatientMedicineDetailDto> {
    return apiFetch(
      {
        method: "POST",
        path: "/v1/medicines",
        body: CreateMedicineRequestSchema.parse(input),
      },
      PatientMedicineDetailDtoSchema,
    );
  },

  async patchMedicine(
    id: string,
    input: PatchMedicineRequest,
  ): Promise<PatientMedicineDetailDto> {
    return apiFetch(
      {
        method: "PATCH",
        path: `/v1/medicines/${id}`,
        body: PatchMedicineRequestSchema.parse(input),
      },
      PatientMedicineDetailDtoSchema,
    );
  },

  async archiveMedicine(id: string) {
    return apiFetch(
      { method: "POST", path: `/v1/medicines/${id}/archive` },
      ArchiveMedicineResponseSchema,
    );
  },

  async deleteMedicine(id: string) {
    return apiFetch(
      { method: "DELETE", path: `/v1/medicines/${id}` },
      DeleteMedicineResponseSchema,
    );
  },

  async searchCatalog(q?: string, page = 1): Promise<CatalogListResponse> {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    qs.set("page", String(page));
    return apiFetch(
      { method: "GET", path: `/v1/medicine-catalog?${qs}` },
      CatalogListResponseSchema,
    );
  },

  async getCatalogEntry(id: string): Promise<CatalogEntryDto> {
    return apiFetch(
      { method: "GET", path: `/v1/medicine-catalog/${id}` },
      CatalogEntryDtoSchema,
    );
  },

  async createCatalogEntry(
    input: CreateCatalogEntryRequest,
  ): Promise<CatalogEntryDto> {
    return apiFetch(
      {
        method: "POST",
        path: "/v1/medicine-catalog",
        body: CreateCatalogEntryRequestSchema.parse(input),
      },
      CatalogEntryDtoSchema,
    );
  },

  async patchCatalogEntry(
    id: string,
    input: PatchCatalogEntryRequest,
  ): Promise<CatalogEntryDto> {
    return apiFetch(
      {
        method: "PATCH",
        path: `/v1/medicine-catalog/${id}`,
        body: PatchCatalogEntryRequestSchema.parse(input),
      },
      CatalogEntryDtoSchema,
    );
  },

  async issuePhoto(
    entryId: string,
    input: IssuePhotoRequest,
  ): Promise<IssuePhotoResponse> {
    return apiFetch(
      {
        method: "POST",
        path: `/v1/medicine-catalog/${entryId}/photos`,
        body: IssuePhotoRequestSchema.parse(input),
      },
      IssuePhotoResponseSchema,
    );
  },

  /** PUT file bytes to the presigned R2 URL, then confirm with the issued key. */
  async uploadPhoto(
    entryId: string,
    slot: "A" | "B" | "C",
    file: File,
  ): Promise<CatalogEntryDto> {
    const issued = await this.issuePhoto(entryId, { slot });
    const put = await fetch(issued.uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) {
      throw new ApiError({
        status: put.status,
        code: "PHOTO_UPLOAD_FAILED",
        message: `Photo upload failed (${put.status})`,
      });
    }
    return apiFetch(
      {
        method: "PUT",
        path: `/v1/medicine-catalog/${entryId}/photos/${slot}`,
        body: { photoKey: issued.photoKey },
      },
      CatalogEntryDtoSchema,
    );
  },
};

export type MedicineClient = typeof medicineClient;
