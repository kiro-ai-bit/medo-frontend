/** Web-push payload parse — tolerant; server shape per LD-NOT-16/18. */

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  data?: { doseId?: string; url?: string };
}

export function parsePushPayload(raw: unknown): PushPayload | null {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const p = obj as Record<string, unknown>;
  const title = typeof p["title"] === "string" ? p["title"] : "Medo";
  const body = typeof p["body"] === "string" ? p["body"] : "";
  const tag = typeof p["tag"] === "string" ? p["tag"] : undefined;
  const dataRaw = p["data"];
  let data: PushPayload["data"];
  if (typeof dataRaw === "object" && dataRaw !== null) {
    const d = dataRaw as Record<string, unknown>;
    data = {
      doseId: typeof d["doseId"] === "string" ? d["doseId"] : undefined,
      url: typeof d["url"] === "string" ? d["url"] : undefined,
    };
  }
  return { title, body, tag, data };
}
