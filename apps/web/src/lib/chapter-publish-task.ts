type TaskStatus = "running" | "completed" | "failed";

export type ChapterPublishTask = {
  id: string;
  userId: string;
  projectId: string;
  status: TaskStatus;
  current: number;
  total: number;
  successCount: number;
  publishedChapterIds: string[];
  currentChapter?: {
    chapterNumber: number;
    title: string;
  } | null;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

declare global {
  var __chapterPublishTasks: Map<string, ChapterPublishTask> | undefined;
}

function getTaskMap() {
  if (!global.__chapterPublishTasks) {
    global.__chapterPublishTasks = new Map<string, ChapterPublishTask>();
  }
  return global.__chapterPublishTasks;
}

function pruneOldTasks() {
  const now = Date.now();
  const map = getTaskMap();
  for (const [id, task] of map.entries()) {
    if (now - task.updatedAt > 60 * 60 * 1000) {
      map.delete(id);
    }
  }
}

export function createChapterPublishTask(params: {
  id: string;
  userId: string;
  projectId: string;
  total: number;
}): ChapterPublishTask {
  pruneOldTasks();
  const task: ChapterPublishTask = {
    id: params.id,
    userId: params.userId,
    projectId: params.projectId,
    status: "running",
    current: 0,
    total: params.total,
    successCount: 0,
    publishedChapterIds: [],
    currentChapter: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  getTaskMap().set(task.id, task);
  return task;
}

export function getChapterPublishTask(taskId: string): ChapterPublishTask | null {
  pruneOldTasks();
  return getTaskMap().get(taskId) || null;
}

export function updateChapterPublishTask(
  taskId: string,
  patch: Partial<ChapterPublishTask>
): ChapterPublishTask | null {
  const map = getTaskMap();
  const task = map.get(taskId);
  if (!task) return null;
  const next = {
    ...task,
    ...patch,
    updatedAt: Date.now(),
  };
  map.set(taskId, next);
  return next;
}

