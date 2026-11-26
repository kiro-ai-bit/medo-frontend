import {
  ListMedicinesResponseSchema,
  type PatientMedicineSummaryDto,
} from "@kiro-ai-bit/contracts";
import { apiFetch } from "../http/apiFetch";

export const medicineClient = {
  async listMedicines(patientId: string): Promise<PatientMedicineSummaryDto[]> {
    const res = await apiFetch(
      { method: "GET", path: `/v1/medicines?patientId=${patientId}` },
      ListMedicinesResponseSchema,
    );
    return res.medicines;
  },
};

export type MedicineClient = typeof medicineClient;
