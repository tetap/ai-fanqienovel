"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, History, FileText, RefreshCw, Star, Upload } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

type ChapterVersion = {
  id: string;
  content: string;
  wordCount: number;
  note: string | null;
  metadata: {
    score?: {
      overall: number;
      plot: number;
      character: number;
      writing: number;
      pacing: number;
      originality?: number;
      feedback?: string;
    };
    title?: string;
    isSelected?: boolean;
    isRegenerated?: boolean;
  } | null;
  createdAt: string;
};

type Chapter = {
  id: string;
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  versions: ChapterVersion[];
};

export default function ChapterDetailPage() {
  const { alert, confirm } = useAlertDialog();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const chapterId = params.chapterId as string;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchChapter();
  }, [chapterId]);

  useEffect(() => {
    if (chapter) {
      setHasChanges(content !== chapter.content);
    }
  }, [content, chapter]);

  const fetchChapter = async () => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}`
      );
      if (response.ok) {
        const data = await response.json();
        setChapter(data.chapter);
        setContent(data.chapter.content);
      } else if (response.status === 404) {
        router.push(`/projects/${projectId}/chapters`);
      }
    } catch (error) {
      console.error("获取章节失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setChapter(data.chapter);
        setHasChanges(false);
        alert("保存成功", "success");
      }
    } catch (error) {
      console.error("保存失败:", error);
      alert("保存失败，请稍后重试", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const loadVersion = async (version: ChapterVersion) => {
    if (await confirm({ title: "确认加载", description: "加载此版本将覆盖当前内容，是否继续？" })) {
      setContent(version.content);
    }
  };

  const handleRegenerate = async () => {
    if (!await confirm({ title: "确认重新生成", description: "确定要重新生成此章节吗？原内容将保留在版本历史中。", type: "warning" })) {
      return;
    }

    setIsRegenerating(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wordCount: 2300,
            versionCount: 1,
          }),
        }
      );

      if (response.ok) {
        await fetchChapter();
        alert("重新生成成功", "success");
      } else {
        const data = await response.json();
        alert(data.error || "重新生成失败", "error");
      }
    } catch (error) {
      console.error("重新生成失败:", error);
      alert("重新生成失败，请稍后重试", "error");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!chapter || isPublishing) return;
    if (chapter.status === "published") {
      alert("该章节已发布", "success");
      return;
    }
    setIsPublishing(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/publish`,
        { method: "POST" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "发布失败");
      }
      setChapter((prev) => (prev ? { ...prev, status: "published" } : prev));
      alert("已发布到番茄", "success");
    } catch (error) {
      alert(error instanceof Error ? error.message : "发布失败，请稍后重试", "error");
    } finally {
      setIsPublishing(false);
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      draft: "草稿",
      published: "已发布",
    };
    return statusMap[status] || "草稿";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!chapter) {
    return null;
  }

  const currentWordCount = content.length;

  // 找到当前版本的评分（最近一个 isSelected 的版本）
  const currentVersionScore = chapter.versions.find(
    (v) => v.metadata?.isSelected && v.metadata?.score
  )?.metadata?.score;

  return (
    <div>
      <Button variant="ghost" asChild className="mb-4">
        <Link href={`/projects/${projectId}/chapters`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回章节列表
        </Link>
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 主编辑区 */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">第 {chapter.chapterNumber} 章</Badge>
                  </div>
                  <CardTitle className="text-2xl">{chapter.title}</CardTitle>
                  <CardDescription className="mt-2">
                    创建于 {new Date(chapter.createdAt).toLocaleString("zh-CN")}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={chapter.status === "published" ? "border-green-600 text-green-600" : undefined}
                  >
                    {getStatusText(chapter.status)}
                  </Badge>
                  <Button
                    variant={chapter.status === "published" ? "outline" : "default"}
                    onClick={handlePublish}
                    disabled={isPublishing || isSaving || isRegenerating || chapter.status === "published"}
                  >
                    <Upload className={`mr-2 h-4 w-4 ${isPublishing ? "animate-pulse" : ""}`} />
                    {chapter.status === "published" ? "已发布" : isPublishing ? "发布中..." : "发布到番茄"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRegenerate}
                    disabled={isRegenerating || isSaving}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} />
                    {isRegenerating ? "生成中..." : "重新生成"}
                  </Button>
                  <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? "保存中..." : "保存"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    当前字数: {currentWordCount.toLocaleString()}
                  </span>
                  {hasChanges && (
                    <Badge variant="secondary">未保存</Badge>
                  )}
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[600px] font-mono text-base leading-relaxed resize-y"
                  placeholder="开始编辑章节内容..."
                />
              </div>
            </CardContent>
          </Card>

        </div>

        {/* 侧边栏 */}
        <div className="space-y-4">
          {/* 统计信息 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">统计信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">字数</p>
                <p className="text-2xl font-bold">
                  {currentWordCount.toLocaleString()}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">状态</p>
                <p className={`font-medium ${chapter.status === "published" ? "text-green-600" : ""}`}>
                  {getStatusText(chapter.status)}
                </p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">最后更新</p>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(chapter.updatedAt), {
                    addSuffix: true,
                    locale: zhCN,
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* AI 评分 */}
          {currentVersionScore && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  AI 评分
                </CardTitle>
                <CardDescription>
                  当前版本综合评分
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">综合</span>
                  <span className="text-2xl font-bold">{currentVersionScore.overall}</span>
                </div>
                <Separator />
                <div className="space-y-2">
                  {[
                    { label: "情节", value: currentVersionScore.plot },
                    { label: "人物", value: currentVersionScore.character },
                    { label: "文笔", value: currentVersionScore.writing },
                    { label: "节奏", value: currentVersionScore.pacing },
                    { label: "原创", value: currentVersionScore.originality ?? 0 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-secondary rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2 transition-all"
                            style={{ width: `${item.value}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{item.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {currentVersionScore.feedback && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">评价</p>
                      <p className="text-sm">{currentVersionScore.feedback}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* 版本历史 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-4 w-4" />
                版本历史
              </CardTitle>
              <CardDescription>
                最近 {chapter.versions.length} 个版本
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chapter.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  暂无历史版本
                </p>
              ) : (
                <div className="space-y-2">
                  {chapter.versions.map((version, index) => (
                    <div
                      key={version.id}
                      className="p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => loadVersion(version)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-medium">
                          版本 {chapter.versions.length - index}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {version.wordCount.toLocaleString()} 字
                        </span>
                      </div>
                      {version.note && (
                        <p className="text-xs text-muted-foreground mb-1">
                          {version.note}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(version.createdAt), {
                          addSuffix: true,
                          locale: zhCN,
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
