"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Eye, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

type Chapter = {
  id: string;
  chapterNumber: number;
  title: string;
  wordCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

const PAGE_SIZE = 10;

export default function ChaptersAllPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchChapters = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/chapters`);
        if (response.ok) {
          const data = await response.json();
          setChapters(data.chapters || []);
        }
      } catch (error) {
        console.error("获取章节失败:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChapters();
  }, [projectId]);

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => b.chapterNumber - a.chapterNumber),
    [chapters]
  );

  const totalPages = Math.max(1, Math.ceil(sortedChapters.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagedChapters = sortedChapters.slice(start, start + PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      draft: "草稿",
      published: "已发布",
    };
    return statusMap[status] || "草稿";
  };

  const getStatusVariant = (status: string) => {
    const variantMap: Record<string, "default" | "secondary" | "outline"> = {
      draft: "secondary",
      published: "outline",
    };
    return variantMap[status] || "secondary";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" asChild>
          <Link href={`/projects/${projectId}/chapters`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回章节管理
          </Link>
        </Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">全部章节</h1>
          <p className="text-muted-foreground mt-1">
            倒序展示（最新在前），共 {sortedChapters.length} 章
          </p>
        </div>
      </div>

      {sortedChapters.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground">还没有已生成章节</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {pagedChapters.map((chapter) => (
              <Card key={chapter.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline">第 {chapter.chapterNumber} 章</Badge>
                        <Badge
                          variant={getStatusVariant(chapter.status)}
                          className={
                            chapter.status === "published"
                              ? "border-green-600 text-green-600"
                              : undefined
                          }
                        >
                          {getStatusText(chapter.status)}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl">{chapter.title}</CardTitle>
                      <CardDescription className="mt-2 flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <FileText className="h-4 w-4" />
                          {chapter.wordCount.toLocaleString()} 字
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDistanceToNow(new Date(chapter.updatedAt), {
                            addSuffix: true,
                            locale: zhCN,
                          })}
                        </span>
                      </CardDescription>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/projects/${projectId}/chapters/${chapter.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        查看
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-muted-foreground">
              第 {currentPage}/{totalPages} 页
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

