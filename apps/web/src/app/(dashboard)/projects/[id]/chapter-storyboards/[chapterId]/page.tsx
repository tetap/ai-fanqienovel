"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clapperboard, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

type Chapter = {
  id: string;
  chapterNumber: number;
  title: string;
};

type StoryboardShot = {
  shot_id: number;
  scene: string;
  camera: "远景" | "中景" | "近景" | "特写";
  characters: string[];
  action: string;
  emotion: string;
  dialogue?: { character: string; text: string } | null;
  duration: number;
  visual_description: string;
};

type SceneImageItem = {
  sceneName: string;
  imageUrl: string;
  updatedAt: string;
};

type SceneImageStatus = {
  totalScenes: number;
  generatedCount: number;
  missingCount: number;
  missingScenes: string[];
  chapterMissingScenes: string[];
  sceneImages: SceneImageItem[];
};

type CharacterItem = {
  name: string;
  imageUrl?: string | null;
};

function normalizeSceneName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export default function ChapterStoryboardDetailPage() {
  const params = useParams();
  const { alert } = useAlertDialog();
  const projectId = params.id as string;
  const chapterId = params.chapterId as string;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [shots, setShots] = useState<StoryboardShot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sceneStatus, setSceneStatus] = useState<SceneImageStatus | null>(null);
  const [isGeneratingScene, setIsGeneratingScene] = useState(false);
  const [sceneActionKey, setSceneActionKey] = useState<string | null>(null);
  const [missingCharacterImages, setMissingCharacterImages] = useState<string[]>([]);

  const refreshSceneStatus = async () => {
    const sceneStatusRes = await fetch(`/api/projects/${projectId}/scene-images?chapterId=${chapterId}`);
    const sceneStatusData = await sceneStatusRes.json().catch(() => ({}));
    if (sceneStatusRes.ok) {
      setSceneStatus(sceneStatusData);
      return true;
    }
    return false;
  };

  const refreshMissingCharacterImages = async (nextShots: StoryboardShot[]) => {
    try {
      const characterRes = await fetch(`/api/projects/${projectId}/characters`);
      const characterData = await characterRes.json().catch(() => ({}));
      if (!characterRes.ok) return;
      const characters = Array.isArray(characterData.characters)
        ? (characterData.characters as CharacterItem[])
        : [];

      const characterImageMap = new Map<string, string | null>();
      for (const character of characters) {
        const name = normalizeSceneName(character.name || "");
        if (!name) continue;
        characterImageMap.set(name, character.imageUrl || null);
      }

      const appearedCharacters = new Set<string>();
      for (const shot of nextShots) {
        for (const name of shot.characters || []) {
          const normalized = normalizeSceneName(name);
          if (normalized) appearedCharacters.add(normalized);
        }
      }

      const missingNames = Array.from(appearedCharacters).filter((name) => {
        if (name === "旁白") return false;
        if (!characterImageMap.has(name)) return false;
        return !characterImageMap.get(name);
      });
      setMissingCharacterImages(missingNames);
    } catch {
      // 角色补全提示是增强能力，失败时不阻断页面主流程
    }
  };

  useEffect(() => {
    const fetchDetail = async () => {
      setIsLoading(true);
      try {
        const [chapterRes, storyboardRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/chapters/${chapterId}`),
          fetch(`/api/projects/${projectId}/chapters/${chapterId}/storyboard`),
        ]);

        if (chapterRes.ok) {
          const chapterData = await chapterRes.json().catch(() => ({}));
          if (chapterData?.chapter) {
            setChapter({
              id: chapterData.chapter.id,
              chapterNumber: chapterData.chapter.chapterNumber,
              title: chapterData.chapter.title,
            });
          }
        }

        const storyboardData = await storyboardRes.json().catch(() => ({}));
        if (!storyboardRes.ok) {
          alert(storyboardData.error || "获取分镜失败", "error");
          return;
        }
        const nextShots = Array.isArray(storyboardData.storyboard?.shots)
          ? storyboardData.storyboard.shots
          : [];
        setShots(nextShots);
        await refreshMissingCharacterImages(nextShots);

        await refreshSceneStatus();
      } finally {
        setIsLoading(false);
      }
    };
    fetchDetail();
  }, [projectId, chapterId, alert]);

  const handleGenerateOneScene = async () => {
    setIsGeneratingScene(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scene-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "补全场景图失败", "error");
        return;
      }

      if (data.done && !data.generatedScene) {
        alert("当前项目场景图已全部补全", "success");
      } else {
        alert(
          `已生成场景：${data.generatedScene}${typeof data.missingCount === "number" ? `，剩余 ${data.missingCount} 个` : ""
          }`,
          "success"
        );
      }

      await refreshSceneStatus();
    } catch (error) {
      alert(error instanceof Error ? error.message : "补全场景图失败", "error");
    } finally {
      setIsGeneratingScene(false);
    }
  };

  const handleReuseSceneImage = async (sceneName: string, sourceSceneName: string) => {
    if (!sourceSceneName) return;
    const key = `${sceneName}-reuse`;
    setSceneActionKey(key);
    try {
      const res = await fetch(`/api/projects/${projectId}/scene-images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneName, sourceSceneName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "选择已有场景图失败", "error");
        return;
      }
      await refreshSceneStatus();
      alert("已应用已有场景图", "success");
    } catch (error) {
      alert(error instanceof Error ? error.message : "选择已有场景图失败", "error");
    } finally {
      setSceneActionKey(null);
    }
  };

  const handleDeleteSceneImage = async (sceneName: string) => {
    const key = `${sceneName}-delete`;
    setSceneActionKey(key);
    try {
      const res = await fetch(`/api/projects/${projectId}/scene-images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "删除场景图失败", "error");
        return;
      }
      await refreshSceneStatus();
      alert("已删除当前场景图", "success");
    } catch (error) {
      alert(error instanceof Error ? error.message : "删除场景图失败", "error");
    } finally {
      setSceneActionKey(null);
    }
  };

  const sceneImageMap = new Map<string, string>(
    (sceneStatus?.sceneImages || []).map((item) => [normalizeSceneName(item.sceneName), item.imageUrl])
  );
  const reusableSceneOptions = (sceneStatus?.sceneImages || []).map((item) => ({
    sceneName: normalizeSceneName(item.sceneName),
    imageUrl: item.imageUrl,
  }));

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild>
        <Link href={`/projects/${projectId}/chapter-storyboards`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回章节分镜
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clapperboard className="h-7 w-7" />
          分镜详情
        </h1>
        <p className="text-muted-foreground mt-1">
          {chapter
            ? `第 ${chapter.chapterNumber} 章《${chapter.title}》`
            : "章节信息加载中..."}
        </p>
      </div>

      {!isLoading && shots.length > 0 && sceneStatus && (
        <div className="rounded-md border p-4 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">场景图补全</p>
              <p className="text-sm text-muted-foreground">
                当前项目已补全 {sceneStatus.generatedCount}/{sceneStatus.totalScenes} 个场景
                {sceneStatus.chapterMissingScenes.length > 0
                  ? `，本章仍缺 ${sceneStatus.chapterMissingScenes.length} 个`
                  : "，本章场景已补全"}
              </p>
            </div>
            <Button
              onClick={handleGenerateOneScene}
              disabled={isGeneratingScene || sceneStatus.missingCount === 0}
              size="sm"
            >
              <ImagePlus className="mr-2 h-4 w-4" />
              {isGeneratingScene ? "生成中..." : "补全生成（每次1个）"}
            </Button>
          </div>

          {sceneStatus.chapterMissingScenes.length > 0 && (
            <div className="text-sm text-amber-600 dark:text-amber-400">
              检测到当前分镜有未补全场景：{sceneStatus.chapterMissingScenes.join("、")}
            </div>
          )}

          {missingCharacterImages.length > 0 && (
            <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center justify-between gap-3">
              <span>检测到当前分镜人物缺少形象图：{missingCharacterImages.join("、")}</span>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${projectId}/characters`}>去补全人物形象</Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">加载中...</p>
      ) : shots.length === 0 ? (
        <p className="text-sm text-muted-foreground">该章节暂无分镜。</p>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="px-3 py-2 w-16">镜号</th>
                <th className="px-3 py-2 w-24">景别</th>
                <th className="px-3 py-2">场景</th>
                <th className="px-3 py-2">人物</th>
                <th className="px-3 py-2">动作</th>
                <th className="px-3 py-2">情绪</th>
                <th className="px-3 py-2">台词</th>
                <th className="px-3 py-2">画面描述</th>
                <th className="px-3 py-2 w-20">时长</th>
              </tr>
            </thead>
            <tbody>
              {shots.map((shot) => (
                <tr key={shot.shot_id} className="border-t align-top">
                  <td className="px-3 py-2">{shot.shot_id}</td>
                  <td className="px-3 py-2">{shot.camera}</td>
                  <td className="px-3 py-2 min-w-[220px]">
                    <p>{shot.scene}</p>
                    {sceneImageMap.get(normalizeSceneName(shot.scene)) ? (
                      <img
                        src={sceneImageMap.get(normalizeSceneName(shot.scene))}
                        alt={`${shot.scene} 场景图`}
                        className="mt-2 h-16 w-28 rounded border object-cover"
                      />
                    ) : (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">待补全场景图</p>
                    )}
                    <div className="mt-2 flex flex-col gap-2">
                      <select
                        className="h-8 rounded border bg-background px-2 text-xs"
                        defaultValue=""
                        onChange={(event) => {
                          const selected = event.target.value;
                          if (!selected) return;
                          void handleReuseSceneImage(shot.scene, selected);
                          event.target.value = "";
                        }}
                        disabled={sceneActionKey === `${shot.scene}-reuse` || reusableSceneOptions.length === 0}
                      >
                        <option value="">选择已有场景图</option>
                        {reusableSceneOptions.map((option) => (
                          <option key={`${shot.scene}-${option.sceneName}`} value={option.sceneName}>
                            复用：{option.sceneName}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleDeleteSceneImage(shot.scene)}
                        disabled={
                          !sceneImageMap.get(normalizeSceneName(shot.scene)) ||
                          sceneActionKey === `${shot.scene}-delete`
                        }
                      >
                        {sceneActionKey === `${shot.scene}-delete` ? "删除中..." : "删除场景图"}
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-2">{shot.characters.join("、") || "-"}</td>
                  <td className="px-3 py-2">{shot.action}</td>
                  <td className="px-3 py-2">{shot.emotion}</td>
                  <td className="px-3 py-2">
                    {shot.dialogue ? `${shot.dialogue.character}：${shot.dialogue.text}` : "-"}
                  </td>
                  <td className="px-3 py-2">{shot.visual_description}</td>
                  <td className="px-3 py-2">{shot.duration}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
