export type RunSummary = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

type Entry = {
  projectId: string;
  expiresAt: number;
  runs: RunSummary[];
};

const TTL_MS = 2000;
const store = new Map<string, Entry>();

export function getRunList(projectId: string): RunSummary[] | null {
  const entry = store.get(projectId);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now() || entry.projectId !== projectId) {
    store.delete(projectId);
    return null;
  }

  return entry.runs;
}

export function setRunList(projectId: string, runs: RunSummary[]): void {
  // The project id is both the key and part of the payload: a bug that loses
  // the key still cannot serve the payload to another project.
  store.set(projectId, { projectId, expiresAt: Date.now() + TTL_MS, runs });
}

export function invalidateRunList(projectId: string): void {
  store.delete(projectId);
}

export function clearRunListCache(): void {
  store.clear();
}
