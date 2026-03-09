"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Settings,
  Users,
  BookOpen,
  FileText,
  Sparkles,
  ImageIcon,
  RefreshCw,
  Lock,
  CheckCircle2,
  Clapperboard,
} from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

type Project = {
  id: string;
  title: string;
  genre: string;
  description: string | null;
  coverImage: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    chapters: number;
    characters: number;
  };
  settings: any;
  outline: any;
  chapters?: Array<{
    id: string;
    wordCount: number;
    content?: string | null;
  }>;
};

function StepHeader({
  step,
  title,
  done,
  locked,
  lockMessage,
}: {
  step: number;
  title: string;
  done?: boolean;
  locked?: boolean;
  lockMessage?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div
        className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${locked
            ? "bg-muted text-muted-foreground"
            : done
              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
              : "bg-primary text-primary-foreground"
          }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : step}
      </div>
      <h3 className={`font-semibold ${locked ? "text-muted-foreground" : ""}`}>
        {title}
      </h3>
      {locked && lockMessage && (
        <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
          <Lock className="mr-1 h-3 w-3" />
          {lockMessage}
        </Badge>
      )}
    </div>
  );
}

function StepConnector() {
  return (
    <div className="flex justify-start ml-[13px] py-1">
      <div className="w-px h-8 bg-border" />
    </div>
  );
}

export default function ProjectDetailPage() {
  const { alert } = useAlertDialog();
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchProject(params.id as string);
    }
  }, [params.id]);

  const fetchProject = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data.project);
      } else if (response.status === 404) {
        router.push("/projects");
      }
    } catch (error) {
      console.error("获取项目失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCover = async () => {
    if (!project) return;
    setIsGeneratingCover(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/cover`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "生成封面失败", "error");
        return;
      }
      const data = await response.json();
      setProject({ ...project, coverImage: data.coverImage });
    } catch (error) {
      console.error("生成封面失败:", error);
      alert("生成封面失败，请稍后重试", "error");
    } finally {
      setIsGeneratingCover(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const hasSettings = !!project.settings;
  const hasOutline = !!project.outline;
  const hasCharacters = project._count.characters > 0;
  const hasCover = !!project.coverImage;
  const isStepTwoDone = hasSettings && hasCharacters && hasOutline && hasCover;
  const totalWords = (project.chapters || []).reduce((sum, chapter) => {
    if (chapter.wordCount && chapter.wordCount > 0) {
      return sum + chapter.wordCount;
    }
    // 兼容历史数据：若未写入 wordCount，则按正文长度粗略统计
    return sum + (chapter.content?.length || 0);
  }, 0);

  return (
    <div>
      {/* 项目头部 */}
      <div className="mb-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/projects">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回项目列表
          </Link>
        </Button>

        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold mb-2">{project.title}</h1>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{project.genre}</Badge>
                <Badge>{project.status === "draft" ? "草稿" : project.status}</Badge>
              </div>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/projects/${project.id}/edit`}>
                <Settings className="mr-2 h-4 w-4" />
                项目设置
              </Link>
            </Button>
          </div>
          {project.description && (
            <p className="text-muted-foreground w-full">
              {project.description}
            </p>
          )}
        </div>
      </div>

      <Separator className="my-6" />

      <h2 className="text-xl font-semibold mb-6">创作流程</h2>

      {/* 第一步：核心设定 */}
      <div>
        <StepHeader step={1} title="核心设定" done={hasSettings} />
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-purple-500">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">核心设定</CardTitle>
                <CardDescription className="mt-1">
                  生成世界观、核心冲突、力量体系等基础设定，这是所有后续创作的基础
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {hasSettings ? "已完成" : "未开始"}
              </span>
              <Button asChild variant="outline" size="sm">
                <Link href={`/projects/${project.id}/settings`}>
                  {hasSettings ? "查看修改" : "开始创建"}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <StepConnector />
      </div>

      {/* 第二步：角色 · 大纲 · 封面（依赖核心设定） */}
      <div>
        <StepHeader
          step={2}
          title="角色 · 大纲 · 封面"
          done={isStepTwoDone}
          locked={!hasSettings}
          lockMessage="请先完成核心设定"
        />
        <div
          className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${!hasSettings ? "opacity-60 pointer-events-none" : ""
            }`}
        >
          {/* 角色设计 */}
          <Card className={`transition-shadow ${hasSettings ? "hover:shadow-md" : ""}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted text-blue-500">
                  <Users className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">角色设计</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                创建和管理小说中的角色
              </p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {project._count.characters} 个角色
                </span>
                {hasSettings ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${project.id}/characters`}>进入</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    <Lock className="mr-1 h-3 w-3" />
                    锁定
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 大纲管理 */}
          <Card className={`transition-shadow ${hasSettings ? "hover:shadow-md" : ""}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted text-green-500">
                  <BookOpen className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">大纲管理</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                规划故事结构和章节大纲
              </p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {hasOutline ? "已完成" : "未创建"}
                </span>
                {hasSettings ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${project.id}/outline`}>进入</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    <Lock className="mr-1 h-3 w-3" />
                    锁定
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 封面图 */}
          <Card className={`transition-shadow ${hasSettings ? "hover:shadow-md" : ""}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted text-rose-500">
                  <ImageIcon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">封面图</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                {project.coverImage ? (
                  <div className="w-full aspect-[3/4] rounded border overflow-hidden">
                    <img
                      src={project.coverImage}
                      alt={project.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full aspect-[3/4] rounded border bg-muted flex items-center justify-center">
                    <div className="text-center">
                      <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">暂无封面</p>
                    </div>
                  </div>
                )}
              </div>
              {hasSettings ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleGenerateCover}
                  disabled={isGeneratingCover}
                >
                  {isGeneratingCover ? (
                    <>
                      <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                      生成中...
                    </>
                  ) : project.coverImage ? (
                    <>
                      <RefreshCw className="mr-1 h-3 w-3" />
                      重新生成
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1 h-3 w-3" />
                      生成封面
                    </>
                  )}
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="w-full" disabled>
                  <Lock className="mr-1 h-3 w-3" />
                  锁定
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <StepConnector />
      </div>

      {/* 第三步：章节创作（依赖大纲管理） */}
      <div>
        <StepHeader
          step={3}
          title="章节创作"
          done={project._count.chapters > 0}
          locked={!hasOutline}
          lockMessage="请先完成大纲管理"
        />
        <Card
          className={`transition-shadow ${!hasOutline ? "opacity-60 pointer-events-none" : "hover:shadow-md"
            }`}
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-orange-500">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">章节创作</CardTitle>
                <CardDescription className="mt-1">
                  按幕生成和编辑章节内容
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {project._count.chapters} 章
              </span>
              {hasOutline ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/projects/${project.id}/chapters`}>进入</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <Lock className="mr-1 h-3 w-3" />
                  锁定
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <StepConnector />
      </div>

      {/* 第四步：章节分镜（独立模块） */}
      <div>
        <StepHeader
          step={4}
          title="章节分镜"
          locked={!hasOutline || project._count.chapters === 0}
          lockMessage={!hasOutline ? "请先完成大纲管理" : "请先创作章节"}
        />
        <Card
          className={`transition-shadow ${
            !hasOutline || project._count.chapters === 0
              ? "opacity-60 pointer-events-none"
              : "hover:shadow-md"
          }`}
        >
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted text-indigo-500">
                <Clapperboard className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">章节分镜</CardTitle>
                <CardDescription className="mt-1">
                  按章节生成分镜
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                在章节创作完成后统一生成与查看分镜
              </span>
              {!hasOutline || project._count.chapters === 0 ? (
                <Button variant="outline" size="sm" disabled>
                  <Lock className="mr-1 h-3 w-3" />
                  锁定
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/projects/${project.id}/chapter-storyboards`}>进入模块</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>项目统计</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">章节数</p>
              <p className="text-2xl font-bold">{project._count.chapters}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">角色数</p>
              <p className="text-2xl font-bold">{project._count.characters}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">总字数</p>
              <p className="text-2xl font-bold">{totalWords.toLocaleString("zh-CN")}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">创建时间</p>
              <p className="text-sm font-medium">
                {new Date(project.createdAt).toLocaleDateString("zh-CN")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
