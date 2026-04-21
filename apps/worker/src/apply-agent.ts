import { promises as fs } from "node:fs";
import path from "node:path";

type ApplyStep = {
  action: string;
  target?: string;
  value?: string;
  outcome: "ok" | "skipped" | "failed";
  note?: string;
  startedAt: string;
  durationMs: number;
  confidence?: number;
  strategy?: string;
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
  artifactPath: string;
  discoveredFields?: DiscoveredField[];
  filledCount?: number;
  steps: ApplyStep[];
  finalSubmitAttempted: boolean;
  finalSubmitExecuted: boolean;
  averageConfidence: number;
  lowConfidenceFieldCount: number;
};

type ApplyOptions = {
  jobId: string;
  url: string;
  enabled: boolean;
  artifactsDir: string;
  allowFinalSubmit: boolean;
};

type ArtifactPayload = {
  jobId: string;
  url: string;
  mode: "playwright" | "simulated";
  createdAt: string;
  title?: string;
  screenshotPath?: string;
  discoveredFields?: DiscoveredField[];
  filledCount?: number;
  steps: ApplyStep[];
  finalSubmitAttempted: boolean;
  finalSubmitExecuted: boolean;
  averageConfidence: number;
  lowConfidenceFieldCount: number;
  note?: string;
};

type AnswerCandidate = {
  value: string;
  confidence: number;
  strategy: string;
};

function inferAnswer(field: DiscoveredField) {
  const key = `${field.label} ${field.placeholder ?? ""}`.toLowerCase();

  if (key.includes("email")) {
    return {
      value: "applicant@example.com",
      confidence: 0.98,
      strategy: "email-pattern",
    } satisfies AnswerCandidate;
  }

  if (key.includes("phone") || key.includes("mobile") || field.type === "tel") {
    return {
      value: "+1 555 012 3456",
      confidence: 0.96,
      strategy: "phone-pattern",
    } satisfies AnswerCandidate;
  }

  if (key.includes("linkedin")) {
    return {
      value: "https://www.linkedin.com/in/carreros-agent",
      confidence: 0.95,
      strategy: "linkedin-url",
    } satisfies AnswerCandidate;
  }

  if (key.includes("portfolio") || key.includes("website") || field.type === "url") {
    return {
      value: "https://github.com/Shivam200427/CareerOS",
      confidence: 0.93,
      strategy: "portfolio-url",
    } satisfies AnswerCandidate;
  }

  if (key.includes("name")) {
    return {
      value: "CareerOS Candidate",
      confidence: 0.9,
      strategy: "name-generic",
    } satisfies AnswerCandidate;
  }

  if (key.includes("cover") || key.includes("why") || key.includes("summary")) {
    return {
      value: "I am excited to contribute with strong software engineering fundamentals and ownership mindset.",
      confidence: 0.72,
      strategy: "longform-generic",
    } satisfies AnswerCandidate;
  }

  return {
    value: "Autofilled by CareerOS agent review flow.",
    confidence: 0.5,
    strategy: "fallback-generic",
  } satisfies AnswerCandidate;
}

export async function runApplyAgent(options: ApplyOptions): Promise<ApplyResult> {
  const artifactsRoot = path.resolve(process.cwd(), options.artifactsDir);
  await fs.mkdir(artifactsRoot, { recursive: true });
  const artifactPath = path.join(artifactsRoot, `${options.jobId}-run.json`);

  async function writeArtifact(payload: ArtifactPayload) {
    await fs.writeFile(artifactPath, JSON.stringify(payload, null, 2), "utf-8");
  }

  async function recordStep(
    steps: ApplyStep[],
    action: string,
    runner: () => Promise<{
      target?: string;
      value?: string;
      note?: string;
      outcome?: "ok" | "skipped";
      confidence?: number;
      strategy?: string;
    }>,
  ) {
    const startedAtDate = new Date();
    const startedAt = startedAtDate.toISOString();
    const startMs = Date.now();
    try {
      const result = await runner();
      const durationMs = Date.now() - startMs;
      const step: ApplyStep = {
        action,
        startedAt,
        durationMs,
        outcome: result.outcome ?? "ok",
        target: result.target,
        value: result.value,
        note: result.note,
        confidence: result.confidence,
        strategy: result.strategy,
      };
      steps.push(step);
      return { ok: true as const, step };
    } catch (error) {
      const durationMs = Date.now() - startMs;
      const step: ApplyStep = {
        action,
        startedAt,
        durationMs,
        outcome: "failed",
        note: error instanceof Error ? error.message : "Step failed",
      };
      steps.push(step);
      return { ok: false as const, step };
    }
  }

  if (!options.enabled) {
    const steps: ApplyStep[] = [
      {
        action: "prepare-run",
        startedAt: new Date().toISOString(),
        durationMs: 1,
        outcome: "ok",
        note: "Created simulated artifact because Playwright is disabled.",
      },
      {
        action: "submit",
        startedAt: new Date().toISOString(),
        durationMs: 1,
        outcome: "skipped",
        note: "No browser execution in simulated mode.",
      },
    ];

    await writeArtifact({
      jobId: options.jobId,
      url: options.url,
      mode: "simulated",
      createdAt: new Date().toISOString(),
      note: "Playwright disabled. Enable PLAYWRIGHT_ENABLED=true for browser execution.",
      steps,
      finalSubmitAttempted: false,
      finalSubmitExecuted: false,
      averageConfidence: 0,
      lowConfidenceFieldCount: 0,
    });

    return {
      mode: "simulated",
      artifactPath,
      steps,
      finalSubmitAttempted: false,
      finalSubmitExecuted: false,
      averageConfidence: 0,
      lowConfidenceFieldCount: 0,
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

    await recordStep(steps, "goto", async () => {
      await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 25000 });
      return { target: options.url };
    });

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

    await recordStep(steps, "discover-fields", async () => ({
      note: `Discovered ${discoveredFields.length} candidate form fields`,
    }));

    let filledCount = 0;
    let confidenceTotal = 0;
    let confidenceCount = 0;
    let lowConfidenceFieldCount = 0;
    for (const field of discoveredFields) {
      const answer = inferAnswer(field);
      const result = await recordStep(steps, "fill", async () => {
        const locator = page.locator(field.selector).first();
        await locator.waitFor({ timeout: 2000 });

        if (field.type === "select") {
          const optionsText = await locator.locator("option").allTextContents();
          if (optionsText.length > 1) {
            await locator.selectOption({ index: 1 });
            return {
              target: field.selector,
              note: `${field.label} (selected option index 1)`,
              confidence: 0.88,
              strategy: "select-first-option",
            };
          }
          return {
            target: field.selector,
            note: "No options to select",
            outcome: "skipped",
            confidence: 0,
            strategy: "select-no-options",
          };
        }

        await locator.fill(answer.value);
        return {
          target: field.selector,
          value: answer.value.slice(0, 64),
          note: field.label,
          confidence: answer.confidence,
          strategy: answer.strategy,
        };
      });

      if (result.ok && result.step.outcome === "ok") {
        filledCount += 1;
        if (typeof result.step.confidence === "number") {
          confidenceTotal += result.step.confidence;
          confidenceCount += 1;
          if (result.step.confidence < 0.65) {
            lowConfidenceFieldCount += 1;
          }
        }
      }
    }

    const averageConfidence = confidenceCount > 0 ? Number((confidenceTotal / confidenceCount).toFixed(3)) : 0;

    let finalSubmitExecuted = false;
    let finalSubmitAttempted = false;
    if (options.allowFinalSubmit) {
      finalSubmitAttempted = true;
      const submitResult = await recordStep(steps, "final-submit", async () => {
        const button = page
          .locator('button[type="submit"], input[type="submit"], button:has-text("Apply"), button:has-text("Submit")')
          .first();
        await button.waitFor({ timeout: 2500 });
        await button.click();
        return {
          note: "Submit action triggered by explicit execute permission.",
        };
      });
      finalSubmitExecuted = submitResult.ok;
    } else {
      await recordStep(steps, "final-submit", async () => ({
        outcome: "skipped",
        note: "Final submit blocked. Enable allowFinalSubmit for this job before execution.",
      }));
    }

    const screenshotPath = path.join(artifactsRoot, `${options.jobId}.png`);
    await recordStep(steps, "screenshot", async () => {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return { target: screenshotPath };
    });

    await writeArtifact({
      jobId: options.jobId,
      url: options.url,
      mode: "playwright",
      createdAt: new Date().toISOString(),
      title,
      screenshotPath,
      discoveredFields,
      filledCount,
      steps,
      finalSubmitAttempted,
      finalSubmitExecuted,
      averageConfidence,
      lowConfidenceFieldCount,
    });

    await context.close();

    return {
      mode: "playwright",
      title,
      screenshotPath,
      artifactPath,
      discoveredFields,
      filledCount,
      steps,
      finalSubmitAttempted,
      finalSubmitExecuted,
      averageConfidence,
      lowConfidenceFieldCount,
    };
  } finally {
    await browser.close();
  }
}
