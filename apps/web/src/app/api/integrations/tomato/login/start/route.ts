import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { startTomatoQrLogin } from "@/lib/tomato-login";
import { z } from "zod";

const startSchema = z.object({
  projectId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { projectId } = startSchema.parse(body);
    const result = await startTomatoQrLogin(session.user.id, projectId?.trim());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "发起扫码登录失败" },
      { status: 500 }
    );
  }
}

