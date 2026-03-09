import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateProjectSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  genre: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "writing", "completed", "archived"]).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

// 获取单个项目
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: {
        settings: true,
        characters: true,
        chapters: { orderBy: { chapterNumber: "asc" } },
        outline: { include: { items: { orderBy: { order: "asc" } } } },
        _count: { select: { chapters: true, characters: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    logger.error("获取项目失败:", { error });
    return NextResponse.json({ error: "获取项目失败" }, { status: 500 });
  }
}

// 更新项目
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const body = await req.json();
    const validatedData = updateProjectSchema.parse(body);

    const project = await prisma.project.update({
      where: { id },
      data: validatedData,
    });

    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("更新项目失败:", { error });
    return NextResponse.json({ error: "更新项目失败" }, { status: 500 });
  }
}

// 删除项目
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ message: "项目已删除" });
  } catch (error) {
    logger.error("删除项目失败:", { error });
    return NextResponse.json({ error: "删除项目失败" }, { status: 500 });
  }
}
