import {
  DoseDetailDtoSchema,
  MarkDoseOutcomeRequestSchema,
  PatientDosesResponseSchema,
  ScheduleListResponseSchema,
  type DoseDetailDto,
  type DoseSummaryDto,
  type MarkDoseOutcomeRequest,
  type ScheduleSummaryDto,
} from "@kiro-ai-bit/contracts";
import { apiFetch } from "../http/apiFetch";

export const scheduleDoseClient = {
  async listDoses(
    patientId: string,
    from: string,
    to: string,
    outcome?: string,
  ): Promise<DoseSummaryDto[]> {
    const qs = new URLSearchParams({ from, to });
    if (outcome) qs.set("outcome", outcome);
    const res = await apiFetch(
      { method: "GET", path: `/v1/patients/${patientId}/doses?${qs}` },
      PatientDosesResponseSchema,
    );
    return res.doses;
  },

  async getDose(id: string): Promise<DoseDetailDto> {
    return apiFetch(
      { method: "GET", path: `/v1/doses/${id}` },
      DoseDetailDtoSchema,
    );
  },

  async markOutcome(
    doseId: string,
    input: MarkDoseOutcomeRequest,
  ): Promise<DoseDetailDto> {
    return apiFetch(
      {
        method: "POST",
        path: `/v1/doses/${doseId}/outcome`,
        body: MarkDoseOutcomeRequestSchema.parse(input),
      },
      DoseDetailDtoSchema,
    );
  },

  async snoozeDose(doseId: string): Promise<DoseDetailDto> {
    return apiFetch(
      { method: "POST", path: `/v1/doses/${doseId}/snooze` },
      DoseDetailDtoSchema,
    );
  },

  async listSchedules(patientId: string): Promise<ScheduleSummaryDto[]> {
    const res = await apiFetch(
      { method: "GET", path: `/v1/patients/${patientId}/schedules` },
      ScheduleListResponseSchema,
    );
    return res.schedules;
  },
};

export type ScheduleDoseClient = typeof scheduleDoseClient;
