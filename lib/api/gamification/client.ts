import {
  GamificationStateDtoSchema,
  type GamificationStateDto,
} from "@kiro-ai-bit/contracts";
import { apiFetch } from "../http/apiFetch";

export const gamificationClient = {
  async getGamification(patientId: string): Promise<GamificationStateDto> {
    return apiFetch(
      { method: "GET", path: `/v1/patients/${patientId}/gamification` },
      GamificationStateDtoSchema,
    );
  },
};

export type GamificationClient = typeof gamificationClient;
