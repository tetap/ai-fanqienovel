"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { BookOpen, Calendar, FileText, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

type Project = {
  id: string;
  title: string;
  genre: string;
  description: string | null;
  status: string;
  updatedAt: string;
  _count: {
    chapters: number;
  };
};

export default function ProjectsPage() {
  const { confirm } = useAlertDialog();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects);
      }
    } catch (error) {
      console.error("获取项目列表失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "确认删除", description: "确定要删除这个项目吗？此操作不可恢复。", type: "warning" })) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setProjects(projects.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("删除项目失败:", error);
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      draft: "草稿",
      writing: "创作中",
      completed: "已完成",
      archived: "已归档",
    };
    return statusMap[status] || status;
  };

  const getStatusVariant = (status: string) => {
    const variantMap: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      draft: "secondary",
      writing: "default",
      completed: "outline",
      archived: "destructive",
    };
    return variantMap[status] || "default";
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">我的项目</h1>
          <p className="text-muted-foreground mt-1">
            管理你的小说创作项目
          </p>
        </div>
        <CreateProjectDialog onSuccess={fetchProjects} />
      </div>

      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">还没有项目</h3>
            <p className="text-muted-foreground mb-4">
              创建你的第一个小说项目，开始创作之旅
            </p>
            <CreateProjectDialog onSuccess={fetchProjects} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="line-clamp-1">{project.title}</CardTitle>
                    <CardDescription className="mt-1">
                      <Badge variant="outline" className="mr-2">
                        {project.genre}
                      </Badge>
                      <Badge variant={getStatusVariant(project.status)}>
                        {getStatusText(project.status)}
                      </Badge>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {project.description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {project.description}
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    <span>{project._count.chapters} 章节</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {formatDistanceToNow(new Date(project.updatedAt), {
                        addSuffix: true,
                        locale: zhCN,
                      })}
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/projects/${project.id}`}>打开项目</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(project.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
