import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTomatoLoginStatus } from "@/lib/tomato-login";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    const result = await getTomatoLoginStatus(session.user.id, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取扫码状态失败" },
      { status: 500 }
    );
  }
}

