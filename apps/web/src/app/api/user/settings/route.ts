import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const userSettingsSchema = z.object({
  aiProvider: z.string().optional().nullable(),
  aiModel: z.string().optional().nullable(),
  aiApiKey: z.string().optional().nullable(),
  aiBaseUrl: z.string().optional().nullable(),
  imageProvider: z.string().optional().nullable(),
  imageModel: z.string().optional().nullable(),
  imageApiKey: z.string().optional().nullable(),
  imageBaseUrl: z.string().optional().nullable(),
});

// 获取用户 AI 配置
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        aiBaseUrl: true,
        imageProvider: true,
        imageModel: true,
        imageApiKey: true,
        imageBaseUrl: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    return NextResponse.json({ settings: user });
  } catch (error) {
    return NextResponse.json({ error: "获取设置失败" }, { status: 500 });
  }
}

// 更新用户 AI 配置
export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await req.json();
    const data = userSettingsSchema.parse(body);

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        aiProvider: data.aiProvider || null,
        aiModel: data.aiModel || null,
        aiApiKey: data.aiApiKey || null,
        aiBaseUrl: data.aiBaseUrl || null,
        imageProvider: data.imageProvider || null,
        imageModel: data.imageModel || null,
        imageApiKey: data.imageApiKey || null,
        imageBaseUrl: data.imageBaseUrl || null,
      },
      select: {
        aiProvider: true,
        aiModel: true,
        aiApiKey: true,
        aiBaseUrl: true,
        imageProvider: true,
        imageModel: true,
        imageApiKey: true,
        imageBaseUrl: true,
      },
    });

    return NextResponse.json({ settings: user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "更新设置失败" }, { status: 500 });
  }
}
