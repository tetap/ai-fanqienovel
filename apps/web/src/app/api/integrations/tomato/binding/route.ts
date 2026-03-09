import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  copyProjectTomatoBinding,
  getProjectTomatoBinding,
  getTomatoBinding,
  listProjectTomatoCopySources,
  setProjectTomatoBookId,
  setTomatoBookId,
  unbindProjectTomato,
  unbindTomato,
} from "@/lib/tomato-login";
import { z } from "zod";

const updateBookIdSchema = z.object({
  bookId: z.string().optional(),
  projectId: z.string().min(1, "缺少项目ID").optional(),
  sourceProjectId: z.string().min(1).optional(),
});

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim();

    const result = projectId
      ? await getProjectTomatoBinding(session.user.id, projectId)
      : await getTomatoBinding(session.user.id);
    const copySources = await listProjectTomatoCopySources(session.user.id, projectId);

    return NextResponse.json({
      ...result,
      copySources,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取绑定状态失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim();
    if (projectId) {
      await unbindProjectTomato(session.user.id, projectId);
    } else {
      await unbindTomato(session.user.id);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "解绑失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await req.json();
    const { bookId, projectId, sourceProjectId } = updateBookIdSchema.parse(body);

    if (sourceProjectId && !projectId) {
      return NextResponse.json({ error: "缺少目标项目ID" }, { status: 400 });
    }

    if (sourceProjectId && projectId) {
      const copied = await copyProjectTomatoBinding({
        userId: session.user.id,
        sourceProjectId: sourceProjectId.trim(),
        targetProjectId: projectId.trim(),
      });
      return NextResponse.json({ success: true, bookId: copied.bookId });
    }

    if (!bookId?.trim()) {
      return NextResponse.json({ error: "请输入书籍ID" }, { status: 400 });
    }

    if (projectId) {
      await setProjectTomatoBookId(session.user.id, projectId.trim(), bookId.trim());
    } else {
      await setTomatoBookId(session.user.id, bookId.trim());
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存书籍ID失败" },
      { status: 500 }
    );
  }
}

