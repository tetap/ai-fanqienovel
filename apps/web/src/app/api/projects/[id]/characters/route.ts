import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createCharacterSchema = z.object({
  name: z.string().min(1, "角色名称不能为空"),
  role: z.enum(["protagonist", "supporting", "antagonist", "minor"]),
  age: z.union([z.number().int(), z.string()]).optional().nullable(),
  gender: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.array(z.string()).default([]),
  background: z.string().min(1, "角色背景不能为空"),
  motivation: z.string().optional(),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  relationships: z.any().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function ensureCharacterImageColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Character"
    ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
  `);
}

function normalizeAge(age: unknown): number | null {
  if (age === null || age === undefined || age === "") return null;
  if (typeof age === "number" && Number.isInteger(age)) return age;
  if (typeof age === "string") {
    const parsed = Number.parseInt(age, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

// 获取项目的所有角色
export async function GET(req: Request, { params }: RouteParams) {
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

    await ensureCharacterImageColumn();
    const characters = (await prisma.$queryRawUnsafe(
      `SELECT
        "id",
        "name",
        "role",
        "age",
        "gender",
        "imageUrl",
        "appearance",
        "personality",
        "background",
        "motivation",
        "strengths",
        "weaknesses",
        "relationships",
        "createdAt",
        "updatedAt"
       FROM "Character"
       WHERE "projectId" = $1
       ORDER BY "createdAt" DESC`,
      id
    )) as Array<any>;

    return NextResponse.json({ characters });
  } catch (error) {
    logger.error("获取角色列表失败:", { error });
    return NextResponse.json({ error: "获取角色列表失败" }, { status: 500 });
  }
}

// 创建新角色
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
    const validatedData = createCharacterSchema.parse(body);

    const character = await prisma.character.create({
      data: {
        projectId: id,
        ...validatedData,
        age: normalizeAge(validatedData.age),
      },
    });

    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("创建角色失败:", { error });
    return NextResponse.json({ error: "创建角色失败" }, { status: 500 });
  }
}
