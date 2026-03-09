import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateOutlineItemSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  keyEvents: z.array(z.string()).optional(),
  characters: z.array(z.string()).optional(),
  order: z.number().optional(),
});

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

// 更新大纲条目
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, itemId } = await params;

    const existing = await prisma.outlineItem.findFirst({
      where: {
        id: itemId,
        outline: { project: { id, userId: session.user.id } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "大纲条目不存在" }, { status: 404 });
    }

    const body = await req.json();
    const validatedData = updateOutlineItemSchema.parse(body);

    const item = await prisma.outlineItem.update({
      where: { id: itemId },
      data: validatedData,
    });

    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("更新大纲条目失败:", { error });
    return NextResponse.json({ error: "更新大纲条目失败" }, { status: 500 });
  }
}

// 删除大纲条目
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, itemId } = await params;

    const existing = await prisma.outlineItem.findFirst({
      where: {
        id: itemId,
        outline: { project: { id, userId: session.user.id } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "大纲条目不存在" }, { status: 404 });
    }

    await prisma.outlineItem.delete({ where: { id: itemId } });

    return NextResponse.json({ message: "大纲条目已删除" });
  } catch (error) {
    logger.error("删除大纲条目失败:", { error });
    return NextResponse.json({ error: "删除大纲条目失败" }, { status: 500 });
  }
}
