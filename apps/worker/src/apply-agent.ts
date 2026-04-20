import { promises as fs } from "node:fs";
import path from "node:path";

export type ApplyResult = {
  mode: "playwright" | "simulated";
  title?: string;
  screenshotPath?: string;
};

type ApplyOptions = {
  jobId: string;
  url: string;
  enabled: boolean;
  artifactsDir: string;
};

export async function runApplyAgent(options: ApplyOptions): Promise<ApplyResult> {
  const artifactsRoot = path.resolve(process.cwd(), options.artifactsDir);
  await fs.mkdir(artifactsRoot, { recursive: true });

  if (!options.enabled) {
    const fallbackPath = path.join(artifactsRoot, `${options.jobId}-simulated.json`);
    await fs.writeFile(
      fallbackPath,
      JSON.stringify(
        {
          jobId: options.jobId,
          url: options.url,
          mode: "simulated",
          createdAt: new Date().toISOString(),
          note: "Playwright disabled. Enable PLAYWRIGHT_ENABLED=true for browser execution.",
        },
        null,
        2,
      ),
      "utf-8",
    );

    return {
      mode: "simulated",
      screenshotPath: fallbackPath,
    };
  }

  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: "CareerOS-Agent/0.1",
      viewport: { width: 1440, height: 960 },
    });

    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 25000 });

    const title = await page.title();
    const screenshotPath = path.join(artifactsRoot, `${options.jobId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await context.close();

    return {
      mode: "playwright",
      title,
      screenshotPath,
    };
  } finally {
    await browser.close();
  }
}
