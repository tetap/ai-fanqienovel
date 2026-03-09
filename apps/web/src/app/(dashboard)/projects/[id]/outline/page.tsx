"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Sparkles, RefreshCw, BookOpen, Trash2, CheckSquare, Square } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

type OutlineItem = {
  id: string;
  chapterNumber: number;
  title: string;
  summary: string;
  keyEvents: string[];
  characters: string[];
  order: number;
};

type Act = {
  actNumber: number;
  title: string;
  chapterRange: string;
  description: string;
  plotSegments?: OutlineItem[];
};

type Outline = {
  id: string;
  structure: Act[];
  plotPoints: Array<{
    name: string;
    chapter: string;
    description: string;
  }>;
  items: OutlineItem[];
};

export default function OutlinePage() {
  const { alert, confirm } = useAlertDialog();
  const params = useParams();
  const projectId = params.id as string;

  const [outline, setOutline] = useState<Outline | null>(null);
  const [targetChapters, setTargetChapters] = useState(100);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchOutline();
  }, [projectId]);

  const fetchOutline = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/outline`);
      if (response.ok) {
        const data = await response.json();
        if (data.outline) {
          // 将 items 按 chapterNumber 分组到对应的幕中
          const groupedOutline = {
            ...data.outline,
            structure: data.outline.structure.map((act: Act) => ({
              ...act,
              plotSegments: data.outline.items.filter(
                (item: OutlineItem) => item.chapterNumber === act.actNumber
              ),
            })),
          };
          setOutline(groupedOutline);
        }
      }
    } catch (error) {
      console.error("获取大纲失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetChapters }),
      });

      if (response.ok) {
        await fetchOutline();
        alert("大纲生成成功！", "success");
      } else {
        const data = await response.json();
        alert(data.error || "生成失败", "error");
      }
    } catch (error) {
      console.error("生成大纲失败:", error);
      alert("生成失败，请稍后重试", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (!outline) return;
    if (selectedIds.size === outline.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(outline.items.map((item) => item.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!await confirm({ title: "确认删除", description: `确定要删除选中的 ${selectedIds.size} 个情节段落吗？`, type: "warning" })) {
      return;
    }

    setIsDeleting(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/projects/${projectId}/outline/${id}`, {
            method: "DELETE",
          })
        )
      );

      setSelectedIds(new Set());
      fetchOutline();
    } catch (error) {
      console.error("批量删除失败:", error);
      alert("删除失败，请稍后重试", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearAll = async () => {
    if (!outline) return;

    if (!await confirm({ title: "确认清空", description: "确定要清空整个大纲吗？此操作不可恢复。", type: "warning" })) {
      return;
    }

    setIsDeleting(true);
    try {
      if (outline.items.length > 0) {
        await Promise.all(
          outline.items.map((item) =>
            fetch(`/api/projects/${projectId}/outline/${item.id}`, {
              method: "DELETE",
            })
          )
        );
      }

      setOutline(null);
      setSelectedIds(new Set());
      alert("大纲已清空", "success");
    } catch (error) {
      console.error("清空失败:", error);
      alert("清空失败，请稍后重试", "error");
    } finally {
      setIsDeleting(false);
    }
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
      <Button variant="ghost" asChild className="mb-4">
        <Link href={`/projects/${projectId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回项目
        </Link>
      </Button>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">大纲管理</h1>
          <p className="text-muted-foreground mt-1">
            AI 智能规划故事结构和情节段落
          </p>
        </div>
        {outline && (
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                onClick={handleBatchDelete}
                disabled={isDeleting}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除选中 ({selectedIds.size})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleClearAll}
              disabled={isDeleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              清空大纲
            </Button>
          </div>
        )}
      </div>

      {/* 生成控制区 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">AI 生成大纲</CardTitle>
          <CardDescription>
            AI 会根据小说类型和章节数智能规划幕数和情节段落
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1 max-w-xs space-y-2 flex flex-col">
              <Label htmlFor="targetChapters">目标章节数</Label>
              <Input
                id="targetChapters"
                type="number"
                min={10}
                max={10000}
                value={targetChapters}
                onChange={(e) => setTargetChapters(Number(e.target.value))}
                disabled={isGenerating}
              />
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {outline ? "重新生成" : "生成大纲"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 大纲内容 */}
      {outline ? (
        <div className="space-y-6">
          {/* 批量操作工具栏 */}
          {outline.items && outline.items.length > 0 && (
            <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/50">
              <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
                {selectedIds.size === outline.items.length ? (
                  <>
                    <CheckSquare className="mr-2 h-4 w-4" />
                    取消全选
                  </>
                ) : (
                  <>
                    <Square className="mr-2 h-4 w-4" />
                    全选
                  </>
                )}
              </Button>
              <span className="text-sm text-muted-foreground">
                已选择 {selectedIds.size} / {outline.items.length} 个情节段落
              </span>
            </div>
          )}

          {/* 动态幕结构（包含情节段落） */}
          {outline.structure && outline.structure.length > 0 && (
            <div className="space-y-4">
              {outline.structure.map((act, actIndex) => (
                <Card key={actIndex}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="default">第 {act.actNumber} 幕</Badge>
                          <CardTitle className="text-xl">{act.title}</CardTitle>
                          <Badge variant="outline">{act.chapterRange}</Badge>
                        </div>
                        <CardDescription>{act.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>

                  {/* 该幕的情节段落 */}
                  {act.plotSegments && act.plotSegments.length > 0 && (
                    <CardContent>
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-muted-foreground">
                          情节段落 ({act.plotSegments.length})
                        </h4>
                        {act.plotSegments.map((segment) => (
                          <div
                            key={segment.id}
                            className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={selectedIds.has(segment.id)}
                                onCheckedChange={() => toggleSelect(segment.id)}
                              />
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <h5 className="font-semibold">{segment.title}</h5>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {segment.summary}
                                </p>
                                {segment.keyEvents.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium mb-1">关键事件：</p>
                                    <div className="flex flex-wrap gap-1">
                                      {segment.keyEvents.map((event, index) => (
                                        <Badge key={index} variant="secondary" className="text-xs">
                                          {event}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {segment.characters.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium mb-1">涉及角色：</p>
                                    <div className="flex flex-wrap gap-1">
                                      {segment.characters.map((character, index) => (
                                        <Badge key={index} variant="outline" className="text-xs">
                                          {character}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* 关键情节点 */}
          {outline.plotPoints && outline.plotPoints.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>关键情节点</CardTitle>
                <CardDescription>故事发展的关键节点</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {outline.plotPoints.map((point, index) => (
                    <div key={index} className="p-4 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{point.name}</h4>
                        <Badge variant="outline">{point.chapter}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {point.description}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="text-center py-12">
          <CardContent>
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">还没有大纲</h3>
            <p className="text-muted-foreground">
              点击上方"生成大纲"按钮，让 AI 为你智能规划故事结构
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
