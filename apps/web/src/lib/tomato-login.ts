import puppeteer, { type Browser, type Cookie, type Page } from "puppeteer";
import * as fs from "fs/promises";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db";

type SessionStatus = "pending" | "success" | "cancelled" | "expired" | "error";

interface TomatoLoginSession {
  sessionId: string;
  userId: string;
  projectId?: string;
  browser: Browser;
  page: Page;
  status: SessionStatus;
  qrCode?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

interface PersistedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: Cookie["sameSite"];
}

declare global {
  var __tomatoLoginSessions: Map<string, TomatoLoginSession> | undefined;
}

const LOGIN_URL = "https://fanqienovel.com/main/writer/login";
const SESSION_TTL_MS = 5 * 60 * 1000;
const QR_SELECTOR = ".slogin-qrcode-scan-page__content__code__img";
const LOGIN_TAB_SELECTOR = ".slogin-pc-form-header__title__tab";
const QR_FALLBACK_SELECTORS = [
  ".slogin-qrcode-scan-page__content__code__img",
  ".slogin-qrcode-scan-page img",
  "img[src^='data:image']",
];
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

async function resolveChromeExecutablePath(): Promise<string | undefined> {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    try {
      await fs.access(file);
      return file;
    } catch {}
  }

  return undefined;
}

async function createLaunchOptions() {
  const executablePath = await resolveChromeExecutablePath();
  return {
    headless: true as const,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1080",
      "--lang=zh-CN,zh;q=0.9,en;q=0.8",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
    defaultViewport: null as any,
    executablePath,
  };
}

async function prepareRealBrowserPage(page: Page): Promise<void> {
  await page.setUserAgent(CHROME_UA);
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.setExtraHTTPHeaders({
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  });
  await page.emulateTimezone("Asia/Shanghai");

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["zh-CN", "zh", "en-US", "en"],
    });
    Object.defineProperty(navigator, "platform", {
      get: () => "MacIntel",
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
  });
}

async function waitAndReadQrCode(page: Page): Promise<string> {
  await page.waitForFunction(
    (selectors) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLImageElement | null;
        if (el?.src && (el.src.startsWith("data:image") || el.src.includes("qrcode"))) {
          return true;
        }
      }
      return false;
    },
    { timeout: 60000 },
    QR_FALLBACK_SELECTORS
  );

  const qrCode = await page.evaluate((selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector) as HTMLImageElement | null;
      if (el?.src && (el.src.startsWith("data:image") || el.src.includes("qrcode"))) {
        return el.src;
      }
    }
    return "";
  }, QR_FALLBACK_SELECTORS);

  return qrCode;
}

async function switchToQrLoginTab(page: Page): Promise<void> {
  await page.waitForSelector(LOGIN_TAB_SELECTOR, { timeout: 30000 });
  await page.evaluate((tabSelector) => {
    const tabs = Array.from(document.querySelectorAll(tabSelector)) as HTMLElement[];
    if (tabs.length === 0) return;

    const textMatch = tabs.find((tab) => tab.textContent?.includes("扫码登录"));
    const dimTab = tabs.find((tab) => tab.classList.contains("slogin-pc-form-header__title__tab--dim"));
    const target = textMatch || dimTab || tabs[0];
    target.click();
  }, LOGIN_TAB_SELECTOR);

  // 等待扫码区域渲染
  await page.waitForFunction(
    (selectors) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLImageElement | null;
        if (el?.src && (el.src.startsWith("data:image") || el.src.includes("qrcode"))) {
          return true;
        }
      }
      return false;
    },
    { timeout: 30000 },
    QR_FALLBACK_SELECTORS
  );
}

async function readAuthorProfile(page: Page): Promise<{
  authorName?: string;
  authorAvatar?: string;
}> {
  try {
    await page.waitForSelector(".slogin-user-avatar__info", { timeout: 15000 });
    const profile = await page.evaluate(() => {
      const nameEl = document.querySelector(
        ".slogin-user-avatar__info__name"
      ) as HTMLElement | null;
      const avatarEl = document.querySelector(
        ".slogin-user-avatar__info__avatar"
      ) as HTMLImageElement | null;
      const authorName = nameEl?.textContent?.trim();
      const authorAvatar = avatarEl?.src;
      return {
        authorName: authorName || undefined,
        authorAvatar: authorAvatar || undefined,
      };
    });
    return profile;
  } catch {
    return {};
  }
}

function getSessionMap(): Map<string, TomatoLoginSession> {
  if (!global.__tomatoLoginSessions) {
    global.__tomatoLoginSessions = new Map<string, TomatoLoginSession>();
  }
  return global.__tomatoLoginSessions;
}

type TomatoBindingRow = {
  tomatoCookies: unknown;
  tomatoAuthorName: string | null;
  tomatoAuthorAvatar: string | null;
  tomatoBoundAt: Date | null;
  tomatoBookId: string | null;
};

type ProjectTomatoDataRow = {
  projectId: string;
  userId: string;
  bookId: string | null;
  tomatoCookies: unknown;
  authorName: string | null;
  authorAvatar: string | null;
  boundAt: Date | null;
  updatedAt: Date;
};

async function loadTomatoBindingRow(userId: string): Promise<TomatoBindingRow | null> {
  const rows = await prisma.$queryRawUnsafe<TomatoBindingRow[]>(
    `SELECT "tomatoCookies","tomatoAuthorName","tomatoAuthorAvatar","tomatoBoundAt","tomatoBookId" FROM "User" WHERE "id" = $1 LIMIT 1`,
    userId
  );
  return rows[0] || null;
}

async function ensureProjectTomatoDataTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectTomatoData" (
      "projectId" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "bookId" TEXT,
      "authorName" TEXT,
      "authorAvatar" TEXT,
      "tomatoCookies" JSONB,
      "boundAt" TIMESTAMPTZ,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "ProjectTomatoData_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE,
      CONSTRAINT "ProjectTomatoData_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ProjectTomatoData"
    ADD COLUMN IF NOT EXISTS "tomatoCookies" JSONB;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ProjectTomatoData"
    ADD COLUMN IF NOT EXISTS "boundAt" TIMESTAMPTZ;
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectTomatoData_userId_idx"
    ON "ProjectTomatoData" ("userId");
  `);
}

async function loadProjectTomatoDataRow(
  userId: string,
  projectId: string
): Promise<ProjectTomatoDataRow | null> {
  await ensureProjectTomatoDataTable();
  const rows = await prisma.$queryRawUnsafe<ProjectTomatoDataRow[]>(
    `SELECT "projectId","userId","bookId","tomatoCookies","authorName","authorAvatar","boundAt","updatedAt"
     FROM "ProjectTomatoData"
     WHERE "userId" = $1 AND "projectId" = $2
     LIMIT 1`,
    userId,
    projectId
  );
  return rows[0] || null;
}

async function saveProjectTomatoBinding(params: {
  userId: string;
  projectId: string;
  cookies: PersistedCookie[];
  authorName?: string | null;
  authorAvatar?: string | null;
  bookId?: string | null;
  boundAt?: Date | null;
}): Promise<void> {
  await ensureProjectTomatoDataTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ProjectTomatoData" ("projectId","userId","bookId","authorName","authorAvatar","tomatoCookies","boundAt","createdAt","updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW(),NOW())
     ON CONFLICT ("projectId")
     DO UPDATE SET
       "userId" = EXCLUDED."userId",
       "bookId" = EXCLUDED."bookId",
       "authorName" = EXCLUDED."authorName",
       "authorAvatar" = EXCLUDED."authorAvatar",
       "tomatoCookies" = EXCLUDED."tomatoCookies",
       "boundAt" = EXCLUDED."boundAt",
       "updatedAt" = NOW()`,
    params.projectId,
    params.userId,
    params.bookId ?? null,
    params.authorName ?? null,
    params.authorAvatar ?? null,
    JSON.stringify(params.cookies || []),
    params.boundAt ?? null
  );
}

async function saveTomatoBindingToDb(params: {
  userId: string;
  cookies: PersistedCookie[];
  authorName?: string;
  authorAvatar?: string;
  boundAt: Date;
}): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "User"
     SET "tomatoCookies" = $1::jsonb,
         "tomatoAuthorName" = $2,
         "tomatoAuthorAvatar" = $3,
         "tomatoBoundAt" = $4
     WHERE "id" = $5`,
    JSON.stringify(params.cookies),
    params.authorName ?? null,
    params.authorAvatar ?? null,
    params.boundAt,
    params.userId
  );
}

function sanitizeCookies(
  cookies: Cookie[]
): PersistedCookie[] {
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }));
}

async function safeClose(session: TomatoLoginSession): Promise<void> {
  try {
    await session.page.close();
  } catch {}
  try {
    await session.browser.close();
  } catch {}
}

function isLoginSuccessUrl(url: string): boolean {
  return (
    /fanqienovel\.com\/main\/writer(\/|$)/.test(url) &&
    !/\/main\/writer\/login/.test(url)
  );
}

export async function startTomatoQrLogin(userId: string, projectId?: string): Promise<{
  sessionId: string;
  qrCode: string;
  expiresInMs: number;
}> {
  const sessions = getSessionMap();

  for (const [id, session] of sessions.entries()) {
    if (session.userId === userId && session.status === "pending") {
      session.status = "cancelled";
      await safeClose(session);
      sessions.delete(id);
    }
  }

  let browser: Browser;
  try {
    browser = await puppeteer.launch(await createLaunchOptions());
  } catch (error) {
    throw new Error(
      "未找到可用 Chrome。请先安装 Google Chrome，或执行 `npx puppeteer browsers install chrome` 后重试。"
    );
  }
  const page = await browser.newPage();
  await prepareRealBrowserPage(page);
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await switchToQrLoginTab(page);

  const qrCode = await waitAndReadQrCode(page);

  if (!qrCode || !qrCode.startsWith("data:image")) {
    await browser.close();
    throw new Error("未获取到二维码，请稍后重试");
  }

  const sessionId = randomUUID();
  sessions.set(sessionId, {
    sessionId,
    userId,
    projectId,
    browser,
    page,
    status: "pending",
    qrCode,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  logger.info("[tomato] 扫码会话已创建", {
    userId,
    sessionId,
  });

  return {
    sessionId,
    qrCode,
    expiresInMs: SESSION_TTL_MS,
  };
}

export async function getTomatoLoginStatus(
  userId: string,
  sessionId: string
): Promise<{
  status: SessionStatus;
  qrCode?: string;
  message?: string;
}> {
  const sessions = getSessionMap();
  const session = sessions.get(sessionId);

  if (!session || session.userId !== userId) {
    return { status: "expired", message: "扫码会话不存在或已失效" };
  }

  if (session.status !== "pending") {
    return { status: session.status, message: session.error };
  }

  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    session.status = "expired";
    await safeClose(session);
    sessions.delete(sessionId);
    return { status: "expired", message: "二维码已过期，请重新发起扫码" };
  }

  try {
    const currentUrl = session.page.url();

    if (isLoginSuccessUrl(currentUrl)) {
      // 扫码成功后进入书籍管理页，确保页面和作者信息都可读取
      await session.page.goto("https://fanqienovel.com/main/writer/book-manage", {
        waitUntil: "networkidle2",
        timeout: 60000,
      });

      const cookies = await session.page.cookies();
      const profile = await readAuthorProfile(session.page);
      const savedAt = new Date();
      const sanitizedCookies = sanitizeCookies(cookies);
      await saveTomatoBindingToDb({
        userId,
        cookies: sanitizedCookies,
        authorName: profile.authorName,
        authorAvatar: profile.authorAvatar,
        boundAt: savedAt,
      });

      if (session.projectId) {
        const projectRow = await loadProjectTomatoDataRow(userId, session.projectId);
        const userRow = await loadTomatoBindingRow(userId);
        await saveProjectTomatoBinding({
          userId,
          projectId: session.projectId,
          cookies: sanitizedCookies,
          authorName: profile.authorName || null,
          authorAvatar: profile.authorAvatar || null,
          // 保留项目原有书籍ID；若没有则回退到用户级书籍ID
          bookId: projectRow?.bookId || userRow?.tomatoBookId || null,
          boundAt: savedAt,
        });
      }

      session.status = "success";
      session.updatedAt = Date.now();
      await safeClose(session);
      sessions.delete(sessionId);

      logger.info("[tomato] 扫码登录成功并已持久化 cookies", {
        userId,
        sessionId,
        cookiesCount: sanitizedCookies.length,
        authorName: profile.authorName,
      });
      return { status: "success" };
    }

    const qrCode = await waitAndReadQrCode(session.page).catch(
      () => session.qrCode || ""
    );

    session.qrCode = qrCode || session.qrCode;
    session.updatedAt = Date.now();

    return {
      status: "pending",
      qrCode: session.qrCode,
      message: "等待扫码登录",
    };
  } catch (error) {
    session.status = "error";
    session.error =
      error instanceof Error ? error.message : "扫码状态检查失败";
    await safeClose(session);
    sessions.delete(sessionId);
    return { status: "error", message: session.error };
  }
}

export async function cancelTomatoLogin(
  userId: string,
  sessionId: string
): Promise<void> {
  const sessions = getSessionMap();
  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) return;

  session.status = "cancelled";
  session.updatedAt = Date.now();
  await safeClose(session);
  sessions.delete(sessionId);
}

export async function getTomatoBinding(userId: string): Promise<{
  bound: boolean;
  savedAt?: string;
  cookiesCount?: number;
  authorName?: string;
  authorAvatar?: string;
  bookId?: string;
}> {
  try {
    const row = await loadTomatoBindingRow(userId);
    const cookies = Array.isArray(row?.tomatoCookies)
      ? (row?.tomatoCookies as unknown[])
      : [];

    return {
      bound: cookies.length > 0,
      savedAt: row?.tomatoBoundAt?.toISOString(),
      cookiesCount: cookies.length,
      authorName: row?.tomatoAuthorName || undefined,
      authorAvatar: row?.tomatoAuthorAvatar || undefined,
      bookId: row?.tomatoBookId || undefined,
    };
  } catch {
    return { bound: false };
  }
}

export async function getProjectTomatoBinding(
  userId: string,
  projectId: string
): Promise<{
  bound: boolean;
  savedAt?: string;
  cookiesCount?: number;
  authorName?: string;
  authorAvatar?: string;
  bookId?: string;
}> {
  try {
    const row = await loadProjectTomatoDataRow(userId, projectId);
    const cookies = Array.isArray(row?.tomatoCookies)
      ? (row?.tomatoCookies as unknown[])
      : [];
    return {
      bound: cookies.length > 0,
      savedAt: row?.boundAt?.toISOString?.() || row?.updatedAt?.toISOString?.(),
      cookiesCount: cookies.length,
      authorName: row?.authorName || undefined,
      authorAvatar: row?.authorAvatar || undefined,
      bookId: row?.bookId || undefined,
    };
  } catch {
    return { bound: false };
  }
}

export async function setProjectTomatoBookId(
  userId: string,
  projectId: string,
  bookId: string
): Promise<void> {
  const row = await loadProjectTomatoDataRow(userId, projectId);
  const userRow = await loadTomatoBindingRow(userId);
  const cookies = Array.isArray(row?.tomatoCookies)
    ? (row?.tomatoCookies as PersistedCookie[])
    : Array.isArray(userRow?.tomatoCookies)
      ? (userRow?.tomatoCookies as PersistedCookie[])
      : [];
  await saveProjectTomatoBinding({
    userId,
    projectId,
    bookId,
    cookies,
    authorName: row?.authorName || userRow?.tomatoAuthorName || null,
    authorAvatar: row?.authorAvatar || userRow?.tomatoAuthorAvatar || null,
    boundAt: row?.boundAt || userRow?.tomatoBoundAt || new Date(),
  });
}

export async function listProjectTomatoCopySources(
  userId: string,
  excludeProjectId?: string
): Promise<
  Array<{
    projectId: string;
    projectTitle: string;
    bookId: string;
    authorName?: string;
    updatedAt: string;
  }>
> {
  await ensureProjectTomatoDataTable();
  const rows = excludeProjectId
    ? await prisma.$queryRawUnsafe<
        Array<{ projectId: string; projectTitle: string; bookId: string; authorName: string | null; updatedAt: Date }>
      >(
        `SELECT p."id" AS "projectId", p."title" AS "projectTitle", d."bookId", d."authorName", d."updatedAt"
         FROM "ProjectTomatoData" d
         JOIN "Project" p ON p."id" = d."projectId"
         WHERE d."userId" = $1 AND d."bookId" IS NOT NULL AND d."projectId" <> $2
         ORDER BY d."updatedAt" DESC`,
        userId,
        excludeProjectId
      )
    : await prisma.$queryRawUnsafe<
        Array<{ projectId: string; projectTitle: string; bookId: string; authorName: string | null; updatedAt: Date }>
      >(
        `SELECT p."id" AS "projectId", p."title" AS "projectTitle", d."bookId", d."authorName", d."updatedAt"
         FROM "ProjectTomatoData" d
         JOIN "Project" p ON p."id" = d."projectId"
         WHERE d."userId" = $1 AND d."bookId" IS NOT NULL
         ORDER BY d."updatedAt" DESC`,
        userId
      );
  return rows.map((row) => ({
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    bookId: row.bookId,
    authorName: row.authorName || undefined,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function copyProjectTomatoBinding(params: {
  userId: string;
  sourceProjectId: string;
  targetProjectId: string;
}): Promise<{ bookId: string }> {
  const source = await loadProjectTomatoDataRow(params.userId, params.sourceProjectId);
  if (!source) {
    throw new Error("源项目暂无可复制的番茄数据");
  }
  const cookies = Array.isArray(source.tomatoCookies)
    ? (source.tomatoCookies as PersistedCookie[])
    : [];
  await saveProjectTomatoBinding({
    userId: params.userId,
    projectId: params.targetProjectId,
    bookId: source.bookId || null,
    cookies,
    authorName: source.authorName,
    authorAvatar: source.authorAvatar,
    boundAt: source.boundAt || new Date(),
  });
  if (!source.bookId) {
    throw new Error("源项目未绑定书籍ID");
  }
  return { bookId: source.bookId };
}

export async function unbindTomato(userId: string): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User"
       SET "tomatoCookies" = NULL,
           "tomatoAuthorName" = NULL,
           "tomatoAuthorAvatar" = NULL,
           "tomatoBoundAt" = NULL,
           "tomatoBookId" = NULL
       WHERE "id" = $1`,
      userId
    );
  } catch {}
}

export async function unbindProjectTomato(userId: string, projectId: string): Promise<void> {
  await ensureProjectTomatoDataTable();
  await prisma.$executeRawUnsafe(
    `DELETE FROM "ProjectTomatoData"
     WHERE "userId" = $1 AND "projectId" = $2`,
    userId,
    projectId
  );
}

export async function setTomatoBookId(userId: string, bookId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "User"
     SET "tomatoBookId" = $1
     WHERE "id" = $2`,
    bookId,
    userId
  );
}

async function resolveEffectiveTomatoBinding(params: {
  userId: string;
  projectId?: string;
  strictProject?: boolean;
}): Promise<{ cookies: Cookie[]; bookId: string }> {
  if (params.projectId) {
    const projectRow = await loadProjectTomatoDataRow(params.userId, params.projectId);
    const projectCookies = Array.isArray(projectRow?.tomatoCookies)
      ? (projectRow?.tomatoCookies as unknown as Cookie[])
      : [];
    const projectBookId = projectRow?.bookId?.trim();
    if (projectCookies.length > 0 && projectBookId) {
      return { cookies: projectCookies, bookId: projectBookId };
    }
    if (params.strictProject) {
      if (projectCookies.length === 0) {
        throw new Error("当前项目未绑定番茄作者，请先在项目设置中扫码绑定");
      }
      throw new Error("当前项目未绑定书籍ID，请先在项目设置中保存书籍ID");
    }
  }

  const userRow = await loadTomatoBindingRow(params.userId);
  const userCookies = Array.isArray(userRow?.tomatoCookies)
    ? (userRow?.tomatoCookies as unknown as Cookie[])
    : [];
  const userBookId = userRow?.tomatoBookId?.trim();
  if (userCookies.length === 0) {
    throw new Error("番茄 cookies 为空，请先完成番茄绑定");
  }
  if (!userBookId) {
    throw new Error("未绑定番茄书籍ID，请先在项目设置中保存书籍ID");
  }
  return { cookies: userCookies, bookId: userBookId };
}

export async function openTomatoWithBoundCookies(userId: string, projectId?: string): Promise<{
  url: string;
}> {
  const { cookies } = await resolveEffectiveTomatoBinding({
    userId,
    projectId,
    strictProject: !!projectId,
  });

  let browser: Browser;
  try {
    browser = await puppeteer.launch(await createLaunchOptions());
  } catch {
    throw new Error(
      "未找到可用 Chrome。请先安装 Google Chrome，或执行 `npx puppeteer browsers install chrome` 后重试。"
    );
  }

  const page = await browser.newPage();
  await prepareRealBrowserPage(page);

  await page.goto("https://fanqienovel.com", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await page.setCookie(...cookies);
  await page.goto("https://fanqienovel.com/main/writer/book-manage", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  const currentUrl = page.url();
  logger.info("[tomato] 测试打开作家页", {
    userId,
    url: currentUrl,
    cookiesCount: cookies.length,
  });

  // 故意不 close，供用户观察登录态页面
  return { url: currentUrl };
}

async function clickButtonByText(
  page: Page,
  text: string,
  timeout = 30000
): Promise<void> {
  await page.waitForFunction(
    (label) =>
      Array.from(document.querySelectorAll("button")).some((btn) =>
        (btn.textContent || "").includes(label)
      ),
    { timeout },
    text
  );
  const clicked = await page.evaluate((label) => {
    const btn = Array.from(document.querySelectorAll("button")).find((el) =>
      (el.textContent || "").includes(label)
    ) as HTMLButtonElement | undefined;
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  if (!clicked) {
    throw new Error(`未找到按钮：${text}`);
  }
}

async function setVisibleInputValueByIndex(
  page: Page,
  selector: string,
  index: number,
  value: string
): Promise<{ success: boolean; actualValue: string }> {
  return page.evaluate(
    ({ inputSelector, inputIndex, inputValue }) => {
      const allInputs = Array.from(
        document.querySelectorAll(inputSelector)
      ) as HTMLInputElement[];
      const visibleInputs = allInputs.filter((input) => {
        const style = window.getComputedStyle(input);
        const rect = input.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          !input.disabled
        );
      });
      const input = visibleInputs[inputIndex] || allInputs[inputIndex];
      if (!input) return { success: false, actualValue: "" };
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(input, inputValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("blur", { bubbles: true }));
      return { success: true, actualValue: (input.value || "").trim() };
    },
    { inputSelector: selector, inputIndex: index, inputValue: value }
  );
}

async function fillChapterMetaInputs(params: {
  page: Page;
  selector: string;
  chapterNumber: number;
  title: string;
}): Promise<void> {
  const chapterValue = String(params.chapterNumber).trim();
  const titleValue = params.title.trim();
  const plans: Array<[number, number]> = [
    [0, 1],
    [1, 0],
  ];

  for (const [chapterIndex, titleIndex] of plans) {
    const chapterSet = await setVisibleInputValueByIndex(
      params.page,
      params.selector,
      chapterIndex,
      chapterValue
    );
    const titleSet = await setVisibleInputValueByIndex(
      params.page,
      params.selector,
      titleIndex,
      titleValue
    );
    if (!chapterSet.success || !titleSet.success) {
      continue;
    }

    const verified = await params.page.evaluate(
      ({ inputSelector, chapterInputIndex, titleInputIndex, expectedChapter, expectedTitle }) => {
        const allInputs = Array.from(
          document.querySelectorAll(inputSelector)
        ) as HTMLInputElement[];
        const visibleInputs = allInputs.filter((input) => {
          const style = window.getComputedStyle(input);
          const rect = input.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0 &&
            !input.disabled
          );
        });
        const chapterInput = visibleInputs[chapterInputIndex] || allInputs[chapterInputIndex];
        const titleInput = visibleInputs[titleInputIndex] || allInputs[titleInputIndex];
        const chapterText = (chapterInput?.value || "").trim();
        const titleText = (titleInput?.value || "").trim();
        return chapterText === expectedChapter && titleText === expectedTitle;
      },
      {
        inputSelector: params.selector,
        chapterInputIndex: chapterIndex,
        titleInputIndex: titleIndex,
        expectedChapter: chapterValue,
        expectedTitle: titleValue,
      }
    );

    if (verified) {
      return;
    }
  }

  throw new Error("章节序号或标题自动填写失败，请重试发布");
}

export async function publishTomatoChapter(params: {
  userId: string;
  projectId?: string;
  chapterNumber: number;
  title: string;
  content: string;
}): Promise<{ url: string; bookId: string; chapterNumber: number }> {
  const results = await publishTomatoChapters({
    userId: params.userId,
    projectId: params.projectId,
    chapters: [
      {
        chapterNumber: params.chapterNumber,
        title: params.title,
        content: params.content,
      },
    ],
  });
  return results[0];
}

async function publishSingleTomatoChapterInPage(params: {
  page: Page;
  bookId: string;
  userId: string;
  chapterNumber: number;
  title: string;
  content: string;
}): Promise<{ url: string; chapterNumber: number }> {
  const publishUrl = `https://fanqienovel.com/main/writer/${params.bookId}/publish/?enter_from=newchapter_1`;
  await params.page.goto(publishUrl, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  const inputSelector = "input.serial-input.byte-input.byte-input-size-default";
  await params.page.waitForSelector(inputSelector, { timeout: 30000 });
  await fillChapterMetaInputs({
    page: params.page,
    selector: inputSelector,
    chapterNumber: params.chapterNumber,
    title: params.title,
  });

  const editorSelector = ".syl-editor-container .ProseMirror[contenteditable='true']";
  await params.page.waitForSelector(editorSelector, { timeout: 30000 });
  await params.page.click(editorSelector, { clickCount: 1 });
  await params.page.keyboard.down("Meta");
  await params.page.keyboard.press("A");
  await params.page.keyboard.up("Meta");
  await params.page.keyboard.press("Backspace");
  await params.page.keyboard.type(params.content, { delay: 1 });

  await clickButtonByText(params.page, "下一步");
  // 点“下一步”后可能先出现“发布提示”或“风险检测”弹窗，循环处理直到进入“发布设置”。
  let reachedPublishSetting = false;
  for (let step = 0; step < 6; step++) {
    await params.page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll(".arco-modal-title")).some((el) => {
          const text = el.textContent || "";
          return (
            text.includes("发布提示") ||
            text.includes("是否进行内容风险检测") ||
            text.includes("发布设置")
          );
        }),
      { timeout: 30000 }
    );

    const modalType = await params.page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll(".arco-modal-title")).map(
        (el) => el.textContent || ""
      );
      if (titles.some((text) => text.includes("发布设置"))) return "publish-setting";
      if (titles.some((text) => text.includes("发布提示"))) return "publish-tip";
      if (titles.some((text) => text.includes("是否进行内容风险检测"))) return "risk-check";
      return "unknown";
    });

    if (modalType === "publish-setting") {
      reachedPublishSetting = true;
      break;
    }
    if (modalType === "publish-tip") {
      await clickButtonByText(params.page, "提交");
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    if (modalType === "risk-check") {
      await clickButtonByText(params.page, "确定");
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
  }
  if (!reachedPublishSetting) {
    throw new Error("未进入发布设置弹窗，可能被发布提示/风险检测流程阻塞");
  }

  await params.page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label.arco-radio"));
    const noLabel = labels.find((label) =>
      (label.textContent || "").includes("否")
    ) as HTMLLabelElement | undefined;
    noLabel?.click();
  });

  const beforeConfirmUrl = params.page.url();
  await clickButtonByText(params.page, "确认发布");
  const publishSignal = await Promise.race([
    params.page
      .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 })
      .then(() => "navigation"),
    params.page
      .waitForFunction(
        (prevUrl) => window.location.href !== prevUrl,
        { timeout: 20000 },
        beforeConfirmUrl
      )
      .then(() => "url-changed"),
    params.page
      .waitForFunction(
        () => {
          const text = document.body?.innerText || "";
          return (
            text.includes("发布成功") ||
            text.includes("提交成功") ||
            text.includes("已发布")
          );
        },
        { timeout: 20000 }
      )
      .then(() => "success-text"),
    params.page
      .waitForFunction(
        () =>
          !Array.from(document.querySelectorAll(".arco-modal-title")).some(
            (el) => (el.textContent || "").includes("发布设置")
          ),
        { timeout: 20000 }
      )
      .then(() => "modal-closed"),
    params.page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll(".arco-modal-title")).some(
            (el) => (el.textContent || "").includes("发布提示")
          ),
        { timeout: 20000 }
      )
      .then(async () => {
        await clickButtonByText(params.page, "提交");
        await Promise.race([
          params.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }),
          params.page.waitForFunction(
            (prevUrl) => window.location.href !== prevUrl,
            { timeout: 20000 },
            beforeConfirmUrl
          ),
          params.page.waitForFunction(
            () => {
              const text = document.body?.innerText || "";
              return (
                text.includes("发布成功") ||
                text.includes("提交成功") ||
                text.includes("已发布")
              );
            },
            { timeout: 20000 }
          ),
        ]).catch(() => null);
        return "typo-submit";
      }),
  ]).catch(() => "timeout");

  const currentUrl = params.page.url();
  logger.info("[tomato] 章节发布完成", {
    userId: params.userId,
    bookId: params.bookId,
    chapterNumber: params.chapterNumber,
    publishSignal,
    url: currentUrl,
  });

  return {
    url: currentUrl,
    chapterNumber: params.chapterNumber,
  };
}

export async function publishTomatoChapters(params: {
  userId: string;
  projectId?: string;
  chapters: Array<{
    chapterNumber: number;
    title: string;
    content: string;
  }>;
}, options?: {
  onChapterStart?: (payload: {
    index: number;
    total: number;
    chapter: { chapterNumber: number; title: string };
  }) => Promise<void> | void;
  onChapterPublished?: (payload: {
    index: number;
    total: number;
    chapter: { chapterNumber: number; title: string };
    result: { url: string; bookId: string; chapterNumber: number };
  }) => Promise<void> | void;
}): Promise<Array<{ url: string; bookId: string; chapterNumber: number }>> {
  if (!params.chapters.length) {
    return [];
  }
  const { cookies, bookId } = await resolveEffectiveTomatoBinding({
    userId: params.userId,
    projectId: params.projectId,
    strictProject: !!params.projectId,
  });

  let browser: Browser;
  try {
    browser = await puppeteer.launch(await createLaunchOptions());
  } catch {
    throw new Error(
      "未找到可用 Chrome。请先安装 Google Chrome，或执行 `npx puppeteer browsers install chrome` 后重试。"
    );
  }

  const page = await browser.newPage();
  try {
    await prepareRealBrowserPage(page);
    await page.goto("https://fanqienovel.com", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await page.setCookie(...cookies);
    const ordered = [...params.chapters].sort(
      (a, b) => a.chapterNumber - b.chapterNumber
    );
    const results: Array<{ url: string; bookId: string; chapterNumber: number }> = [];
    const publishIntervalMs = 10_000;
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      if (options?.onChapterStart) {
        await options.onChapterStart({
          index: i + 1,
          total: ordered.length,
          chapter: {
            chapterNumber: item.chapterNumber,
            title: item.title,
          },
        });
      }
      const result = await publishSingleTomatoChapterInPage({
        page,
        bookId,
        userId: params.userId,
        chapterNumber: item.chapterNumber,
        title: item.title,
        content: item.content,
      });
      results.push({
        url: result.url,
        bookId,
        chapterNumber: item.chapterNumber,
      });
      if (options?.onChapterPublished) {
        await options.onChapterPublished({
          index: i + 1,
          total: ordered.length,
          chapter: {
            chapterNumber: item.chapterNumber,
            title: item.title,
          },
          result: {
            url: result.url,
            bookId,
            chapterNumber: item.chapterNumber,
          },
        });
      }
      if (i < ordered.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, publishIntervalMs));
      }
    }
    return results;
  } finally {
    try {
      await page.close();
    } catch {}
    try {
      await browser.close();
    } catch {}
  }
}

