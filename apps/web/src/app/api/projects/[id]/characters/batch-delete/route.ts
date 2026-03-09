import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const batchDeleteSchema = z.object({
  characterIds: z.array(z.string()).optional(),
  deleteAll: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// 批量删除角色
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const body = await req.json();
    const { characterIds, deleteAll } = batchDeleteSchema.parse(body);

    let deletedCount = 0;

    if (deleteAll) {
      // 删除所有角色
      const result = await prisma.character.deleteMany({
        where: { projectId: id },
      });
      deletedCount = result.count;
    } else if (characterIds && characterIds.length > 0) {
      // 删除指定的角色
      const result = await prisma.character.deleteMany({
        where: {
          id: { in: characterIds },
          projectId: id, // 确保只能删除自己项目的角色
        },
      });
      deletedCount = result.count;
    } else {
      return NextResponse.json(
        { error: "请指定要删除的角色或选择清空所有" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: `成功删除 ${deletedCount} 个角色`,
      deletedCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("批量删除角色失败:", { error });
    return NextResponse.json(
      { error: "批量删除角色失败" },
      { status: 500 }
    );
  }
}
