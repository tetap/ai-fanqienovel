type ProjectLockInfo = {
  chapterNumber: number;
  startedAt: number;
};

declare global {
  var __chapterGenerationLocks: Map<string, ProjectLockInfo> | undefined;
}

function getLockMap(): Map<string, ProjectLockInfo> {
  if (!global.__chapterGenerationLocks) {
    global.__chapterGenerationLocks = new Map<string, ProjectLockInfo>();
  }
  return global.__chapterGenerationLocks;
}

export function acquireProjectChapterLock(
  projectId: string,
  chapterNumber: number
): { ok: true } | { ok: false; current: ProjectLockInfo } {
  const map = getLockMap();
  const current = map.get(projectId);
  if (current) {
    return { ok: false, current };
  }
  map.set(projectId, { chapterNumber, startedAt: Date.now() });
  return { ok: true };
}

export function releaseProjectChapterLock(projectId: string): void {
  getLockMap().delete(projectId);
}

