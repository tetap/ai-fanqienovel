import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelTomatoLogin } from "@/lib/tomato-login";
import { z } from "zod";

const cancelSchema = z.object({
  sessionId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId } = cancelSchema.parse(body);
    await cancelTomatoLogin(session.user.id, sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "取消扫码登录失败" },
      { status: 500 }
    );
  }
}

