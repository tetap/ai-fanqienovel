import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">小说创作系统</h1>
        <p className="text-lg text-muted-foreground mb-8">
          基于 AI 的智能小说创作辅助平台
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/login">登录</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/register">注册</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
