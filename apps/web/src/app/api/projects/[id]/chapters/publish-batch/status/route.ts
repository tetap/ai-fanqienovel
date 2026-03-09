import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getChapterPublishTask } from "@/lib/chapter-publish-task";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId");
  if (!taskId) {
    return NextResponse.json({ error: "taskId 不能为空" }, { status: 400 });
  }

  const task = getChapterPublishTask(taskId);
  if (!task || task.projectId !== id || task.userId !== session.user.id) {
    return NextResponse.json({ error: "任务不存在或无权访问" }, { status: 404 });
  }

  return NextResponse.json({
    task,
  });
}

