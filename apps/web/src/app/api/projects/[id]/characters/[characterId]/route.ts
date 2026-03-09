import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateCharacterSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["protagonist", "supporting", "antagonist", "minor"]).optional(),
  age: z.union([z.number().int(), z.string()]).optional().nullable(),
  gender: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.array(z.string()).optional(),
  background: z.string().optional(),
  motivation: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  relationships: z.any().optional(),
});

type RouteParams = { params: Promise<{ id: string; characterId: string }> };

async function ensureCharacterImageColumn() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Character"
    ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
  `);
}

function normalizeAge(age: unknown): number | null | undefined {
  if (age === undefined) return undefined;
  if (age === null || age === "") return null;
  if (typeof age === "number" && Number.isInteger(age)) return age;
  if (typeof age === "string") {
    const parsed = Number.parseInt(age, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

// 获取单个角色详情
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, characterId } = await params;

    await ensureCharacterImageColumn();
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT
        c."id",
        c."projectId",
        c."name",
        c."role",
        c."age",
        c."gender",
        c."imageUrl",
        c."appearance",
        c."personality",
        c."background",
        c."motivation",
        c."strengths",
        c."weaknesses",
        c."relationships",
        c."createdAt",
        c."updatedAt"
       FROM "Character" c
       JOIN "Project" p ON p."id" = c."projectId"
       WHERE c."id" = $1 AND p."id" = $2 AND p."userId" = $3
       LIMIT 1`,
      characterId,
      id,
      session.user.id
    )) as Array<any>;
    const character = rows[0] || null;

    if (!character) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }

    return NextResponse.json({ character });
  } catch (error) {
    logger.error("获取角色失败:", { error });
    return NextResponse.json({ error: "获取角色失败" }, { status: 500 });
  }
}

// 更新角色
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, characterId } = await params;

    const existing = await prisma.character.findFirst({
      where: {
        id: characterId,
        project: { id, userId: session.user.id },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }

    const body = await req.json();
    const validatedData = updateCharacterSchema.parse(body);
    const normalizedAge = normalizeAge(validatedData.age);
    const { age: _age, ...restData } = validatedData;

    const character = await prisma.character.update({
      where: { id: characterId },
      data: {
        ...restData,
        ...(normalizedAge !== undefined ? { age: normalizedAge } : {}),
      },
    });

    return NextResponse.json({ character });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    logger.error("更新角色失败:", { error });
    return NextResponse.json({ error: "更新角色失败" }, { status: 500 });
  }
}

// 删除角色
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id, characterId } = await params;

    const existing = await prisma.character.findFirst({
      where: {
        id: characterId,
        project: { id, userId: session.user.id },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }

    await prisma.character.delete({ where: { id: characterId } });

    return NextResponse.json({ message: "角色已删除" });
  } catch (error) {
    logger.error("删除角色失败:", { error });
    return NextResponse.json({ error: "删除角色失败" }, { status: 500 });
  }
}
