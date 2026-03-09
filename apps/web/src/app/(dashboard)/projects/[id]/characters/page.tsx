"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CreateCharacterDialog } from "@/components/create-character-dialog";
import { GenerateCharacterDialog } from "@/components/generate-character-dialog";
import { BatchGenerateCharactersDialog } from "@/components/batch-generate-characters-dialog";
import { ArrowLeft, Users, Trash2, CheckSquare, Square, Sparkles } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

type Character = {
  id: string;
  name: string;
  role: string;
  age: number | null;
  gender: string | null;
  imageUrl?: string | null;
  appearance: string | null;
  personality: string[];
  background: string;
  motivation: string | null;
  strengths: string[];
  weaknesses: string[];
};

export default function CharactersPage() {
  const { alert, confirm } = useAlertDialog();
  const params = useParams();
  const projectId = params.id as string;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [generatingImageId, setGeneratingImageId] = useState<string | null>(null);

  useEffect(() => {
    fetchCharacters();
  }, [projectId]);

  const fetchCharacters = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/characters`);
      if (response.ok) {
        const data = await response.json();
        setCharacters(data.characters);
      }
    } catch (error) {
      console.error("获取角色列表失败:", error);
    } finally {
      setIsLoading(false);
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
    if (selectedIds.size === characters.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(characters.map((c) => c.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!await confirm({ title: "确认删除", description: `确定要删除选中的 ${selectedIds.size} 个角色吗？此操作不可恢复。`, type: "warning" })) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/characters/batch-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: Array.from(selectedIds) }),
      });

      if (response.ok) {
        setSelectedIds(new Set());
        fetchCharacters();
      } else {
        const data = await response.json();
        alert(data.error || "删除失败", "error");
      }
    } catch (error) {
      console.error("批量删除失败:", error);
      alert("删除失败，请稍后重试", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearAll = async () => {
    if (!await confirm({ title: "确认清空", description: `确定要清空所有 ${characters.length} 个角色吗？此操作不可恢复。`, type: "warning" })) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/characters/batch-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });

      if (response.ok) {
        setSelectedIds(new Set());
        fetchCharacters();
      } else {
        const data = await response.json();
        alert(data.error || "清空失败", "error");
      }
    } catch (error) {
      console.error("清空角色失败:", error);
      alert("清空失败，请稍后重试", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async (characterId: string) => {
    if (!await confirm({ title: "确认删除", description: "确定要删除这个角色吗？此操作不可恢复。", type: "warning" })) {
      return;
    }

    try {
      const response = await fetch(
        `/api/projects/${projectId}/characters/${characterId}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        setCharacters(characters.filter((c) => c.id !== characterId));
      }
    } catch (error) {
      console.error("删除角色失败:", error);
    }
  };

  const handleGenerateImage = async (characterId: string) => {
    setGeneratingImageId(characterId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/characters/${characterId}/image`,
        { method: "POST" }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "生成失败");
      }

      await fetchCharacters();
    } catch (error) {
      console.error("生成角色形象失败:", error);
      alert(error instanceof Error ? error.message : "生成角色形象失败", "error");
    } finally {
      setGeneratingImageId(null);
    }
  };

  const getRoleText = (role: string) => {
    const roleMap: Record<string, string> = {
      protagonist: "主角",
      supporting: "配角",
      antagonist: "反派",
      minor: "次要角色",
    };
    return roleMap[role] || role;
  };

  const getRoleVariant = (role: string) => {
    const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      protagonist: "default",
      supporting: "secondary",
      antagonist: "destructive",
      minor: "outline",
    };
    return variantMap[role] || "outline";
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
          <h1 className="text-3xl font-bold">角色设计</h1>
          <p className="text-muted-foreground mt-1">
            创建和管理小说中的角色
          </p>
        </div>
        <div className="flex gap-2">
          {characters.length > 0 && (
            <>
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
                清空所有
              </Button>
            </>
          )}
          <BatchGenerateCharactersDialog
            projectId={projectId}
            hasExistingCharacters={characters.length > 0}
            onSuccess={fetchCharacters}
          />
          <GenerateCharacterDialog projectId={projectId} onSuccess={fetchCharacters} />
          <CreateCharacterDialog projectId={projectId} onSuccess={fetchCharacters} />
        </div>
      </div>

      {characters.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">还没有角色</h3>
            <p className="text-muted-foreground mb-4">
              创建第一个角色，开始构建你的故事世界
            </p>
            <div className="flex gap-2 justify-center">
              <BatchGenerateCharactersDialog
                projectId={projectId}
                hasExistingCharacters={false}
                onSuccess={fetchCharacters}
              />
              <GenerateCharacterDialog projectId={projectId} onSuccess={fetchCharacters} />
              <CreateCharacterDialog projectId={projectId} onSuccess={fetchCharacters} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div>
          {/* 批量选择工具栏 */}
          <div className="mb-4 flex items-center gap-4 p-4 rounded-lg border bg-muted/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectAll}
            >
              {selectedIds.size === characters.length ? (
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
              已选择 {selectedIds.size} / {characters.length} 个角色
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {characters.map((character) => (
              <Card key={character.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedIds.has(character.id)}
                        onCheckedChange={() => toggleSelect(character.id)}
                      />
                      <Badge variant={getRoleVariant(character.role)}>
                        {getRoleText(character.role)}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(character.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                <CardTitle className="text-xl">{character.name}</CardTitle>
                <CardDescription>
                  {character.age && `${character.age}岁`}
                  {character.age && character.gender && " · "}
                  {character.gender}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex gap-3">
                  <div className="w-24 shrink-0 space-y-2">
                    {character.imageUrl ? (
                      <div className="h-32 overflow-hidden rounded-md border bg-muted">
                        <img
                          src={character.imageUrl}
                          alt={`${character.name} 形象图`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-32 rounded-md border border-dashed bg-muted/40 flex items-center justify-center text-xs text-muted-foreground px-2 text-center">
                        暂无形象图
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleGenerateImage(character.id)}
                      disabled={generatingImageId === character.id}
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      {generatingImageId === character.id
                        ? "生成中"
                        : character.imageUrl
                          ? "重新生成形象"
                          : "生成形象"}
                    </Button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    {character.appearance && (
                      <div>
                        <p className="text-xs font-medium mb-1">外貌</p>
                        <p className="text-sm text-muted-foreground max-h-14 overflow-y-auto pr-1">
                          {character.appearance}
                        </p>
                      </div>
                    )}

                    {character.personality.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">性格</p>
                        <div className="flex flex-wrap gap-1">
                          {character.personality.map((trait, index) => (
                            <Badge key={index} variant="outline" className="text-[11px] px-1.5 py-0">
                              {trait}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-medium mb-1">背景</p>
                      <p className="text-sm text-muted-foreground max-h-20 overflow-y-auto pr-1">
                        {character.background}
                      </p>
                    </div>

                    {character.motivation && (
                      <div>
                        <p className="text-xs font-medium mb-1">动机</p>
                        <p className="text-sm text-muted-foreground max-h-14 overflow-y-auto pr-1">
                          {character.motivation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {(character.strengths.length > 0 || character.weaknesses.length > 0) && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                    {character.strengths.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                          优势
                        </p>
                        <div className="space-y-1">
                          {character.strengths.map((strength, index) => (
                            <p key={index} className="text-xs text-muted-foreground">
                              · {strength}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {character.weaknesses.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                          弱点
                        </p>
                        <div className="space-y-1">
                          {character.weaknesses.map((weakness, index) => (
                            <p key={index} className="text-xs text-muted-foreground">
                              · {weakness}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      )}

      {characters.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>角色统计</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">总角色数</p>
                <p className="text-2xl font-bold">{characters.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">主角</p>
                <p className="text-2xl font-bold">
                  {characters.filter((c) => c.role === "protagonist").length}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">配角</p>
                <p className="text-2xl font-bold">
                  {characters.filter((c) => c.role === "supporting").length}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">反派</p>
                <p className="text-2xl font-bold">
                  {characters.filter((c) => c.role === "antagonist").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
