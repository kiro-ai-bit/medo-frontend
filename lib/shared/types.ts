import type { z } from "zod";
import { roleSchema } from "@kiro-ai-bit/contracts";

export type Role = z.infer<typeof roleSchema>;
