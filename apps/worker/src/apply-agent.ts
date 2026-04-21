import { promises as fs } from "node:fs";
import path from "node:path";

type ApplyStep = {
  action: string;
  target?: string;
  value?: string;
  outcome: "ok" | "skipped" | "failed";
  note?: string;
};

type DiscoveredField = {
  selector: string;
  label: string;
  type: string;
  placeholder?: string;
};

export type ApplyResult = {
  mode: "playwright" | "simulated";
  title?: string;
  screenshotPath?: string;
  discoveredFields?: DiscoveredField[];
  filledCount?: number;
  steps: ApplyStep[];
};

type ApplyOptions = {
  jobId: string;
  url: string;
  enabled: boolean;
  artifactsDir: string;
};

function inferAnswer(field: DiscoveredField) {
  const key = `${field.label} ${field.placeholder ?? ""}`.toLowerCase();

  if (key.includes("email")) {
    return "applicant@example.com";
  }

  if (key.includes("phone") || key.includes("mobile") || field.type === "tel") {
    return "+1 555 012 3456";
  }

  if (key.includes("linkedin")) {
    return "https://www.linkedin.com/in/carreros-agent";
  }

  if (key.includes("portfolio") || key.includes("website") || field.type === "url") {
    return "https://github.com/Shivam200427/CareerOS";
  }

  if (key.includes("name")) {
    return "CareerOS Candidate";
  }

  if (key.includes("cover") || key.includes("why") || key.includes("summary")) {
    return "I am excited to contribute with strong software engineering fundamentals and ownership mindset.";
  }

  return "Autofilled by CareerOS agent review flow.";
}

export async function runApplyAgent(options: ApplyOptions): Promise<ApplyResult> {
  const artifactsRoot = path.resolve(process.cwd(), options.artifactsDir);
  await fs.mkdir(artifactsRoot, { recursive: true });

  if (!options.enabled) {
    const fallbackPath = path.join(artifactsRoot, `${options.jobId}-simulated.json`);
    const steps: ApplyStep[] = [
      {
        action: "prepare-run",
        outcome: "ok",
        note: "Created simulated artifact because Playwright is disabled.",
      },
      {
        action: "submit",
        outcome: "skipped",
        note: "No browser execution in simulated mode.",
      },
    ];

    await fs.writeFile(
      fallbackPath,
      JSON.stringify(
        {
          jobId: options.jobId,
          url: options.url,
          mode: "simulated",
          createdAt: new Date().toISOString(),
          note: "Playwright disabled. Enable PLAYWRIGHT_ENABLED=true for browser execution.",
          steps,
        },
        null,
        2,
      ),
      "utf-8",
    );

    return {
      mode: "simulated",
      screenshotPath: fallbackPath,
      steps,
    };
  }

  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent: "CareerOS-Agent/0.1",
      viewport: { width: 1440, height: 960 },
    });

    const steps: ApplyStep[] = [];
    const page = await context.newPage();

    steps.push({ action: "goto", target: options.url, outcome: "ok" });
    await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 25000 });

    const title = await page.title();

    const discoveredFields = await page.evaluate(() => {
      const controls = Array.from(document.querySelectorAll("input, textarea, select"));
      const output: Array<{ selector: string; label: string; type: string; placeholder?: string }> = [];

      for (const control of controls) {
        const element = control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const disabled = (element as HTMLInputElement).disabled;
        const hidden =
          element instanceof HTMLInputElement &&
          ["hidden", "submit", "button", "reset", "file", "checkbox", "radio"].includes(element.type);
        if (disabled || hidden) {
          continue;
        }

        let selector = "";
        if (element.id) {
          selector = `#${CSS.escape(element.id)}`;
        } else if ((element as HTMLInputElement).name) {
          selector = `[name=\"${CSS.escape((element as HTMLInputElement).name)}\"]`;
        } else {
          continue;
        }

        let label = "";
        if (element.id) {
          const labelElement = document.querySelector(`label[for=\"${CSS.escape(element.id)}\"]`);
          if (labelElement) {
            label = (labelElement.textContent ?? "").trim();
          }
        }

        if (!label) {
          const parentLabel = element.closest("label");
          if (parentLabel) {
            label = (parentLabel.textContent ?? "").trim();
          }
        }

        output.push({
          selector,
          label: label || (element as HTMLInputElement).name || element.tagName,
          type: element instanceof HTMLInputElement ? element.type || "text" : element.tagName.toLowerCase(),
          placeholder: (element as HTMLInputElement).placeholder || undefined,
        });

        if (output.length >= 12) {
          break;
        }
      }

      return output;
    });

    steps.push({
      action: "discover-fields",
      outcome: "ok",
      note: `Discovered ${discoveredFields.length} candidate form fields`,
    });

    let filledCount = 0;
    for (const field of discoveredFields) {
      const answer = inferAnswer(field);
      try {
        const locator = page.locator(field.selector).first();
        await locator.waitFor({ timeout: 2000 });

        if (field.type === "select") {
          const options = await locator.locator("option").allTextContents();
          if (options.length > 1) {
            await locator.selectOption({ index: 1 });
            steps.push({ action: "select", target: field.selector, outcome: "ok", note: field.label });
            filledCount += 1;
          } else {
            steps.push({ action: "select", target: field.selector, outcome: "skipped", note: "No options" });
          }
          continue;
        }

        await locator.fill(answer);
        steps.push({ action: "fill", target: field.selector, value: answer.slice(0, 64), outcome: "ok", note: field.label });
        filledCount += 1;
      } catch (error) {
        steps.push({
          action: "fill",
          target: field.selector,
          outcome: "failed",
          note: error instanceof Error ? error.message : "Fill failed",
        });
      }
    }

    steps.push({
      action: "submit",
      outcome: "skipped",
      note: "Final submit click intentionally disabled in this phase.",
    });

    const screenshotPath = path.join(artifactsRoot, `${options.jobId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    steps.push({ action: "screenshot", target: screenshotPath, outcome: "ok" });

    await context.close();

    return {
      mode: "playwright",
      title,
      screenshotPath,
      discoveredFields,
      filledCount,
      steps,
    };
  } finally {
    await browser.close();
  }
}
