"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

type ChapterItem = {
  id: string;
  chapterNumber: number;
  title: string;
  status: string;
};

type StoryboardSummary = {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  shotCount: number;
  updatedAt: string;
};

export default function ChapterStoryboardsPage() {
  const params = useParams();
  const router = useRouter();
  const { alert, confirm } = useAlertDialog();
  const projectId = params.id as string;

  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [storyboardMap, setStoryboardMap] = useState<Record<string, StoryboardSummary>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [operatingChapterId, setOperatingChapterId] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [chaptersRes, storyboardsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/chapters`),
        fetch(`/api/projects/${projectId}/chapters/storyboards`),
      ]);
      if (chaptersRes.ok) {
        const data = await chaptersRes.json();
        setChapters(Array.isArray(data.chapters) ? data.chapters : []);
      }
      if (storyboardsRes.ok) {
        const data = await storyboardsRes.json();
        const rows: StoryboardSummary[] = Array.isArray(data.storyboards) ? data.storyboards : [];
        const map: Record<string, StoryboardSummary> = {};
        rows.forEach((row) => {
          map[row.chapterId] = row;
        });
        setStoryboardMap(map);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const generatedCount = useMemo(
    () => Object.keys(storyboardMap).length,
    [storyboardMap]
  );
  const generatedChapterNumbers = useMemo(
    () => new Set(Object.values(storyboardMap).map((item) => item.chapterNumber)),
    [storyboardMap]
  );

  const handleGenerate = async (chapter: ChapterItem) => {
    if (operatingChapterId) return;
    setOperatingChapterId(chapter.id);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapter.id}/storyboard`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error || "生成分镜失败", "error");
        return;
      }
      alert("分镜生成成功", "success");
      await fetchData();
    } catch (error) {
      alert("生成分镜失败，请稍后重试", "error");
    } finally {
      setOperatingChapterId(null);
    }
  };

  const handleView = (chapter: ChapterItem) => {
    router.push(`/projects/${projectId}/chapter-storyboards/${chapter.id}`);
  };

  const handleClear = async (chapter: ChapterItem) => {
    if (operatingChapterId) return;
    const ok = await confirm({
      title: "确认清空分镜",
      description: `确认清空第 ${chapter.chapterNumber} 章分镜吗？`,
      type: "warning",
    });
    if (!ok) return;

    setOperatingChapterId(chapter.id);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapter.id}/storyboard`,
        { method: "DELETE" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error || "清空分镜失败", "error");
        return;
      }
      alert("分镜已清空", "success");
      await fetchData();
    } catch (error) {
      alert("清空分镜失败，请稍后重试", "error");
    } finally {
      setOperatingChapterId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href={`/projects/${projectId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回项目
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clapperboard className="h-7 w-7" />
          章节分镜
        </h1>
        <p className="text-muted-foreground mt-1">
          按章节生成短剧分镜。已生成 {generatedCount}/{chapters.length} 章。
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : chapters.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无章节，请先去章节创作。</p>
      ) : (
        <div className="space-y-3">
          {chapters.map((chapter) => {
            const summary = storyboardMap[chapter.id];
            const isFirstChapter = chapter.chapterNumber === 1;
            const canGenerate =
              isFirstChapter || generatedChapterNumbers.has(chapter.chapterNumber - 1);
            return (
              <div key={chapter.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      第 {chapter.chapterNumber} 章《{chapter.title}》
                    </p>
                    <div className="text-xs text-muted-foreground mt-1">
                      {summary ? `已生成 ${summary.shotCount} 镜` : "未生成分镜"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={summary ? "default" : "secondary"}>
                      {summary ? "已生成" : "未生成"}
                    </Badge>
                    {canGenerate ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerate(chapter)}
                        disabled={!!operatingChapterId}
                      >
                        {operatingChapterId === chapter.id ? "处理中..." : summary ? "重新生成" : "生成分镜"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        等待第 {chapter.chapterNumber - 1} 章分镜
                      </span>
                    )}
                    {summary ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => handleView(chapter)}>
                          查看
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleClear(chapter)}
                          disabled={!!operatingChapterId}
                        >
                          清空
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
