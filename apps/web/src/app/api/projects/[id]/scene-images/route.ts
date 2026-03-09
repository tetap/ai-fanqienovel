import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateImage, generateObject, resolveAIConfig, resolveImageConfig } from "@/lib/ai";
import { buildCharacterPlanPrompt } from "@/lib/prompts";
import { characterPlanSchema } from "@/lib/schemas";

type RouteParams = { params: Promise<{ id: string }> };

const generateNextSchema = z.object({
  chapterId: z.string().optional(),
});

const reuseSceneImageSchema = z.object({
  sceneName: z.string().min(1, "sceneName 不能为空"),
  sourceSceneName: z.string().min(1, "sourceSceneName 不能为空").optional(),
  imageUrl: z.string().min(1, "imageUrl 不能为空").optional(),
});

const deleteSceneImageSchema = z.object({
  sceneName: z.string().min(1, "sceneName 不能为空"),
});

function normalizeSceneName(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\s+/g, " ").trim();
}

async function ensureChapterStoryboardTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ChapterStoryboard" (
      "id" TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "chapterId" TEXT NOT NULL,
      "chapterNumber" INTEGER NOT NULL,
      "chapterTitle" TEXT NOT NULL,
      "shots" JSONB NOT NULL,
      "debug" JSONB,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "ChapterStoryboard_projectId_fkey"
        FOREIGN KEY ("projectId")
        REFERENCES "Project"("id")
        ON DELETE CASCADE,
      CONSTRAINT "ChapterStoryboard_chapterId_fkey"
        FOREIGN KEY ("chapterId")
        REFERENCES "Chapter"("id")
        ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ChapterStoryboard_chapterId_key"
    ON "ChapterStoryboard" ("chapterId");
  `);
}

async function ensureSceneImageTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SceneImage" (
      "id" TEXT PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "sceneName" TEXT NOT NULL,
      "imageUrl" TEXT NOT NULL,
      "prompt" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "SceneImage_projectId_fkey"
        FOREIGN KEY ("projectId")
        REFERENCES "Project"("id")
        ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "SceneImage_projectId_sceneName_key"
    ON "SceneImage" ("projectId", "sceneName");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SceneImage_projectId_idx"
    ON "SceneImage" ("projectId");
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

async function ensureCharactersIfMissing(projectId: string, userId: string) {
  const count = await prisma.character.count({ where: { projectId } });
  if (count > 0) {
    return { generated: false, count };
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { settings: true },
  });
  if (!project?.settings) {
    throw new Error("请先生成核心设定，再自动生成角色");
  }

  const prompt = buildCharacterPlanPrompt({
    title: project.title,
    genre: project.genre,
    worldView: project.settings.worldView,
    coreConflict: project.settings.coreConflict,
    characterCount: 8,
    existingCharacters: [],
  });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const aiConfig = resolveAIConfig(project, user);
  const parsed = await generateObject(prompt, characterPlanSchema, {
    ...aiConfig,
    temperature: 0.8,
  });

  const characters = await Promise.all(
    parsed.characters.map((char) =>
      prisma.character.create({
        data: {
          projectId,
          name: char.name,
          role: char.role,
          age: normalizeAge(char.age),
          gender: char.gender || null,
          appearance: char.appearance || null,
          personality: char.personality || [],
          background: char.background,
          motivation: char.motivation || null,
          strengths: char.strengths || [],
          weaknesses: char.weaknesses || [],
          relationships: parsed.relationships || [],
        },
      })
    )
  );

  logger.info("[scene-images] 检测到无角色，已自动调用角色生成模块", {
    projectId,
    generatedCount: characters.length,
  });

  return { generated: true, count: characters.length };
}

async function collectProjectScenes(projectId: string): Promise<string[]> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT trim(scene_name) AS "sceneName"
     FROM (
       SELECT jsonb_array_elements("shots")->>'scene' AS scene_name
       FROM "ChapterStoryboard"
       WHERE "projectId" = $1
     ) s
     WHERE scene_name IS NOT NULL
       AND trim(scene_name) <> ''
     ORDER BY trim(scene_name) ASC`,
    projectId
  )) as Array<{ sceneName: string }>;
  return rows.map((row) => normalizeSceneName(row.sceneName)).filter(Boolean);
}

async function collectChapterScenes(projectId: string, chapterId?: string): Promise<string[]> {
  if (!chapterId) return [];
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "shots"
     FROM "ChapterStoryboard"
     WHERE "projectId" = $1 AND "chapterId" = $2
     LIMIT 1`,
    projectId,
    chapterId
  )) as Array<{ shots: any }>;
  if (!rows.length || !Array.isArray(rows[0].shots)) return [];
  const ordered: string[] = [];
  for (const shot of rows[0].shots) {
    const normalized = normalizeSceneName((shot as any)?.scene);
    if (normalized && !ordered.includes(normalized)) {
      ordered.push(normalized);
    }
  }
  return ordered;
}

async function getSceneImageRows(projectId: string) {
  return (await prisma.$queryRawUnsafe(
    `SELECT "sceneName","imageUrl","updatedAt"
     FROM "SceneImage"
     WHERE "projectId" = $1
     ORDER BY "updatedAt" DESC`,
    projectId
  )) as Array<{ sceneName: string; imageUrl: string; updatedAt: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    await ensureChapterStoryboardTable();
    await ensureSceneImageTable();

    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get("chapterId") || undefined;

    const [projectScenes, chapterScenes, sceneImages] = await Promise.all([
      collectProjectScenes(id),
      collectChapterScenes(id, chapterId),
      getSceneImageRows(id),
    ]);

    const imageMap = new Map(
      sceneImages.map((item) => [normalizeSceneName(item.sceneName), item.imageUrl])
    );

    const missingScenes = projectScenes.filter((scene) => !imageMap.has(scene));
    const chapterMissingScenes = chapterScenes.filter((scene) => !imageMap.has(scene));

    return NextResponse.json({
      totalScenes: projectScenes.length,
      generatedCount: projectScenes.length - missingScenes.length,
      missingCount: missingScenes.length,
      missingScenes,
      chapterMissingScenes,
      sceneImages: sceneImages.map((item) => ({
        sceneName: normalizeSceneName(item.sceneName),
        imageUrl: item.imageUrl,
        updatedAt: item.updatedAt,
      })),
    });
  } catch (error) {
    logger.error("[scene-images] 获取状态失败", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取场景图状态失败" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: { settings: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    await ensureChapterStoryboardTable();
    await ensureSceneImageTable();
    await ensureCharactersIfMissing(id, session.user.id);

    const body = await req.json().catch(() => ({}));
    const { chapterId } = generateNextSchema.parse(body);
    const [projectScenes, chapterScenes, sceneImages] = await Promise.all([
      collectProjectScenes(id),
      collectChapterScenes(id, chapterId),
      getSceneImageRows(id),
    ]);

    const imageSet = new Set(sceneImages.map((item) => normalizeSceneName(item.sceneName)));
    const missingProjectScenes = projectScenes.filter((scene) => !imageSet.has(scene));

    if (!missingProjectScenes.length) {
      return NextResponse.json({
        done: true,
        generatedScene: null,
        missingCount: 0,
      });
    }

    const chapterMissing = chapterScenes.filter((scene) => !imageSet.has(scene));
    const targetScene = chapterMissing[0] || missingProjectScenes[0];
    if (!targetScene) {
      return NextResponse.json({
        done: true,
        generatedScene: null,
        missingCount: 0,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    const imageConfig = resolveImageConfig(project, user);

    const prompt = `为小说《${project.title}》生成场景图：${targetScene}。
风格要求：二次元Q版风格（必须），日系动画背景美术，非写实，色彩统一，线条清晰。
画面要求：仅表现环境与场景氛围，不出现角色正脸特写，不出现文字水印，不出现 logo。
用途：用于短剧分镜的场景参考图，构图清楚，可读性强。`;

    const negativePrompt =
      "写实照片风, 真人脸特写, 低清晰度, 模糊, 水印, logo, 文字, 构图混乱, 暗部过曝, 杂乱背景";

    const rawImage = await generateImage(prompt, {
      ...imageConfig,
      quality: "standard",
      negativePrompt,
    });

    let imageBuffer: Buffer;
    if (rawImage.startsWith("data:")) {
      const base64Data = rawImage.split(",")[1];
      imageBuffer = Buffer.from(base64Data, "base64");
    } else {
      const response = await fetch(rawImage);
      if (!response.ok) {
        throw new Error("下载生成场景图失败");
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
    }

    const outputBuffer = await sharp(imageBuffer)
      .resize(1280, 720, { fit: "cover", position: "center" })
      .jpeg({ quality: 88 })
      .toBuffer();

    const outputDir = path.join(process.cwd(), "public", "uploads", "scenes");
    await fs.mkdir(outputDir, { recursive: true });
    const safeName = targetScene.replace(/[^\w\u4e00-\u9fa5-]/g, "_").slice(0, 40);
    const fileName = `${id}-${safeName || "scene"}-${Date.now()}.jpg`;
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, outputBuffer);
    const imageUrl = `/uploads/scenes/${fileName}`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "SceneImage" ("id","projectId","sceneName","imageUrl","prompt","createdAt","updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT ("projectId","sceneName")
       DO UPDATE SET
         "imageUrl" = EXCLUDED."imageUrl",
         "prompt" = EXCLUDED."prompt",
         "updatedAt" = NOW()`,
      randomUUID(),
      id,
      targetScene,
      imageUrl,
      prompt
    );

    const latestImages = await getSceneImageRows(id);
    const latestSet = new Set(latestImages.map((item) => normalizeSceneName(item.sceneName)));
    const remainingMissing = projectScenes.filter((scene) => !latestSet.has(scene));

    return NextResponse.json({
      done: remainingMissing.length === 0,
      generatedScene: targetScene,
      imageUrl,
      missingCount: remainingMissing.length,
      remainingScenes: remainingMissing,
    });
  } catch (error) {
    logger.error("[scene-images] 生成失败", { error });
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "参数错误" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成场景图失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    await ensureSceneImageTable();

    const body = await req.json().catch(() => ({}));
    const parsed = reuseSceneImageSchema.parse(body);
    const sceneName = normalizeSceneName(parsed.sceneName);
    if (!sceneName) {
      return NextResponse.json({ error: "场景名称不能为空" }, { status: 400 });
    }

    let imageUrl = parsed.imageUrl?.trim();
    if (parsed.sourceSceneName) {
      const sourceSceneName = normalizeSceneName(parsed.sourceSceneName);
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT "imageUrl"
         FROM "SceneImage"
         WHERE "projectId" = $1 AND "sceneName" = $2
         LIMIT 1`,
        id,
        sourceSceneName
      )) as Array<{ imageUrl: string }>;
      if (!rows.length) {
        return NextResponse.json({ error: "未找到可复用的场景图" }, { status: 404 });
      }
      imageUrl = rows[0].imageUrl;
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "请选择已有场景图" }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "SceneImage" ("id","projectId","sceneName","imageUrl","prompt","createdAt","updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT ("projectId","sceneName")
       DO UPDATE SET
         "imageUrl" = EXCLUDED."imageUrl",
         "updatedAt" = NOW()`,
      randomUUID(),
      id,
      sceneName,
      imageUrl,
      "手动选择已有场景图"
    );

    return NextResponse.json({ success: true, sceneName, imageUrl });
  } catch (error) {
    logger.error("[scene-images] 手动设置失败", { error });
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "参数错误" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "设置场景图失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    await ensureSceneImageTable();
    const body = await req.json().catch(() => ({}));
    const { sceneName } = deleteSceneImageSchema.parse(body);
    const normalized = normalizeSceneName(sceneName);
    if (!normalized) {
      return NextResponse.json({ error: "场景名称不能为空" }, { status: 400 });
    }

    const deletedCount = await prisma.$executeRawUnsafe(
      `DELETE FROM "SceneImage" WHERE "projectId" = $1 AND "sceneName" = $2`,
      id,
      normalized
    );
    return NextResponse.json({ success: true, deletedCount, sceneName: normalized });
  } catch (error) {
    logger.error("[scene-images] 删除失败", { error });
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "参数错误" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除场景图失败" },
      { status: 500 }
    );
  }
}
