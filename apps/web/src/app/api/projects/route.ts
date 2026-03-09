import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createProjectSchema = z.object({
  title: z.string().min(1, "项目标题不能为空").max(100, "标题最多100个字符"),
  genre: z.string().min(1, "请选择小说类型"),
  description: z.string().optional(),
});

// 获取用户的所有项目
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const projects = await prisma.project.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { chapters: true },
        },
      },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    logger.error("获取项目列表失败:", { error });
    return NextResponse.json(
      { error: "获取项目列表失败" },
      { status: 500 }
    );
  }
}

// 创建新项目
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await req.json();
    const validatedData = createProjectSchema.parse(body);

    const project = await prisma.project.create({
      data: {
        title: validatedData.title,
        genre: validatedData.genre,
        description: validatedData.description,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("创建项目失败:", { error });
    return NextResponse.json(
      { error: "创建项目失败" },
      { status: 500 }
    );
  }
}
