/** Registry of extra purge steps (e.g. Dexie delete) — lib-side modules register here so lib never imports features. */
const extraPurgeSteps: Array<() => Promise<void>> = [];

export function registerPurgeStep(step: () => Promise<void>): void {
  extraPurgeSteps.push(step);
}

export async function runPurgeSteps(): Promise<void> {
  for (const step of extraPurgeSteps) {
    try {
      await step();
    } catch {
      // best-effort — purge must complete
    }
  }
}
