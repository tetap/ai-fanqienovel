import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { openTomatoWithBoundCookies } from "@/lib/tomato-login";
import { z } from "zod";

const testOpenSchema = z.object({
  projectId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { projectId } = testOpenSchema.parse(body);
    const result = await openTomatoWithBoundCookies(session.user.id, projectId?.trim());
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "测试打开失败",
      },
      { status: 500 }
    );
  }
}

