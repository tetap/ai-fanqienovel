"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Sparkles, Save, RefreshCw } from "lucide-react";
import { useAlertDialog } from "@/hooks/use-alert-dialog";

type Faction = { name: string; description: string };
type SpecialRule = { name: string; description: string };

type Settings = {
  id: string;
  worldView: string;
  coreConflict: string;
  powerSystem: string | null;
  factions: Faction[];
  specialRules: SpecialRule[];
};

export default function SettingsPage() {
  const { alert } = useAlertDialog();
  const params = useParams();
  const projectId = params.id as string;

  const [settings, setSettings] = useState<Settings | null>(null);
  const [keywords, setKeywords] = useState("");
  const [enableRefineKeywords, setEnableRefineKeywords] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 可编辑字段
  const [worldView, setWorldView] = useState("");
  const [coreConflict, setCoreConflict] = useState("");
  const [powerSystem, setPowerSystem] = useState("");

  useEffect(() => {
    fetchSettings();
  }, [projectId]);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/settings`);
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSettings(data.settings);
          setWorldView(data.settings.worldView);
          setCoreConflict(data.settings.coreConflict);
          setPowerSystem(data.settings.powerSystem || "");
        }
      }
    } catch (error) {
      console.error("获取设定失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    console.log("开始生成设定，项目ID:", projectId);
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords,
          enableRefineKeywords,
        }),
      });

      console.log("API 响应状态:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("生成成功:", data);
        setSettings(data.settings);
        setWorldView(data.settings.worldView);
        setCoreConflict(data.settings.coreConflict);
        setPowerSystem(data.settings.powerSystem || "");
        alert("设定生成成功！", "success");
      } else {
        const data = await response.json();
        console.error("生成失败:", data);
        alert(data.error || "生成失败", "error");
      }
    } catch (error) {
      console.error("生成设定失败:", error);
      alert(`生成失败：${error instanceof Error ? error.message : "请稍后重试"}`, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldView,
          coreConflict,
          powerSystem,
          factions: settings.factions,
          specialRules: settings.specialRules,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error("保存失败:", error);
    } finally {
      setIsSaving(false);
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
          <h1 className="text-3xl font-bold">核心设定</h1>
          <p className="text-muted-foreground mt-1">
            生成和管理小说的世界观、冲突和力量体系
          </p>
        </div>
        {settings && (
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "保存中..." : "保存修改"}
          </Button>
        )}
      </div>

      {/* 生成控制区 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">AI 生成设定</CardTitle>
          <CardDescription>
            可选输入关键词来引导 AI 生成核心设定（不填也可直接生成）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="keywords">关键词（可选）</Label>
              <Textarea
                id="keywords"
                placeholder="输入关键词，如：修仙、废柴逆袭、宗门争斗、天才少年..."
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                disabled={isGenerating}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                提供详细的关键词可以让 AI 生成更符合你构想的设定
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border p-3">
              <Checkbox
                id="enable-refine-keywords"
                checked={enableRefineKeywords}
                onCheckedChange={(checked) => setEnableRefineKeywords(checked === true)}
                disabled={isGenerating}
              />
              <Label htmlFor="enable-refine-keywords" className="cursor-pointer text-sm">
                优化关键词（更完整但会更慢）
              </Label>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full sm:w-auto"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {settings ? "重新生成" : "生成设定"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 设定内容 */}
      {settings ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>世界观</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={worldView}
                onChange={(e) => setWorldView(e.target.value)}
                rows={8}
                className="resize-y"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>核心冲突</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={coreConflict}
                onChange={(e) => setCoreConflict(e.target.value)}
                rows={6}
                className="resize-y"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>力量体系</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={powerSystem}
                onChange={(e) => setPowerSystem(e.target.value)}
                rows={6}
                className="resize-y"
              />
            </CardContent>
          </Card>

          {settings.factions && (settings.factions as Faction[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>势力阵营</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(settings.factions as Faction[]).map((faction, index) => (
                    <div key={index} className="p-4 rounded-lg border">
                      <h4 className="font-semibold mb-2">{faction.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {faction.description}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {settings.specialRules && (settings.specialRules as SpecialRule[]).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>特殊规则</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(settings.specialRules as SpecialRule[]).map((rule, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <Badge variant="outline">{rule.name}</Badge>
                      <p className="text-sm text-muted-foreground">
                        {rule.description}
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
            <Sparkles className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">还没有核心设定</h3>
            <p className="text-muted-foreground">
              点击上方"生成设定"按钮，让 AI 为你的小说创建世界观
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
