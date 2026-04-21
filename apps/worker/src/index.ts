import { QueueEvents, Worker } from "bullmq";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import { runApplyAgent } from "./apply-agent.js";
import { env } from "./env.js";

type JobStatus =
  | "queued"
  | "processing"
  | "awaiting_approval"
  | "approved"
  | "completed"
  | "skipped"
  | "failed";

type JobStore = {
  jobs: Array<{
    id: string;
    status: JobStatus;
    retries: number;
    allowFinalSubmit?: boolean;
    lastError?: string;
    agentRun?: {
      startedAt?: string;
      finishedAt?: string;
      durationMs?: number;
    };
    agentResult?: {
      mode: "playwright" | "simulated";
      title?: string;
      screenshotPath?: string;
      artifactPath?: string;
      finalSubmitAttempted?: boolean;
      finalSubmitExecuted?: boolean;
      averageConfidence?: number;
      lowConfidenceFieldCount?: number;
      discoveredFields?: Array<{
        selector: string;
        label: string;
        type: string;
        placeholder?: string;
      }>;
      filledCount?: number;
      steps?: Array<{
        action: string;
        target?: string;
        value?: string;
        outcome: "ok" | "skipped" | "failed";
        note?: string;
        confidence?: number;
        strategy?: string;
        startedAt?: string;
        durationMs?: number;
      }>;
    };
    updatedAt: string;
  }>;
};

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const jobsDbPath = path.resolve(repoRoot, env.JOB_DB_FILE);

async function ensureStoreReady() {
  await fs.mkdir(path.dirname(jobsDbPath), { recursive: true });
  try {
    await fs.access(jobsDbPath);
  } catch {
    const initial: JobStore = { jobs: [] };
    await fs.writeFile(jobsDbPath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function updateJobStatus(jobId: string, status: JobStatus, lastError?: string) {
  if (!jobId) {
    return;
  }

  await ensureStoreReady();
  const raw = await fs.readFile(jobsDbPath, "utf-8");
  const store = JSON.parse(raw) as JobStore;
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job) {
    return;
  }

  job.status = status;
  job.updatedAt = new Date().toISOString();
  if (lastError) {
    job.lastError = lastError;
    job.retries += 1;
  }

  await fs.writeFile(jobsDbPath, JSON.stringify(store, null, 2), "utf-8");
}

async function saveRunTimeline(jobId: string, startedAt: string, finishedAt: string) {
  if (!jobId) {
    return;
  }

  await ensureStoreReady();
  const raw = await fs.readFile(jobsDbPath, "utf-8");
  const store = JSON.parse(raw) as JobStore;
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job) {
    return;
  }

  const durationMs = Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());
  job.agentRun = { startedAt, finishedAt, durationMs };
  job.updatedAt = new Date().toISOString();

  await fs.writeFile(jobsDbPath, JSON.stringify(store, null, 2), "utf-8");
}

async function saveAgentResult(
  jobId: string,
  result: {
    mode: "playwright" | "simulated";
    title?: string;
    screenshotPath?: string;
    artifactPath: string;
    finalSubmitAttempted: boolean;
    finalSubmitExecuted: boolean;
    averageConfidence: number;
    lowConfidenceFieldCount: number;
    discoveredFields?: Array<{
      selector: string;
      label: string;
      type: string;
      placeholder?: string;
    }>;
    filledCount?: number;
    steps?: Array<{
      action: string;
      target?: string;
      value?: string;
      outcome: "ok" | "skipped" | "failed";
      note?: string;
      confidence?: number;
      strategy?: string;
      startedAt?: string;
      durationMs?: number;
    }>;
  },
) {
  if (!jobId) {
    return;
  }

  await ensureStoreReady();
  const raw = await fs.readFile(jobsDbPath, "utf-8");
  const store = JSON.parse(raw) as JobStore;
  const job = store.jobs.find((item) => item.id === jobId);
  if (!job) {
    return;
  }

  job.agentResult = result;
  job.updatedAt = new Date().toISOString();
  await fs.writeFile(jobsDbPath, JSON.stringify(store, null, 2), "utf-8");
}

const worker = new Worker(
  env.JOB_QUEUE_NAME,
  async (job) => {
    const baseJobId = String(job.data?.jobId ?? "");
    const runStart = new Date().toISOString();
    console.log(`Processing job ${job.id}`, job.name, job.data);

    await updateJobStatus(baseJobId, "processing");

    await new Promise((resolve) => {
      setTimeout(resolve, 900);
    });

    if (job.name === "manual-job-intake") {
      await updateJobStatus(baseJobId, "awaiting_approval");
    } else {
      const result = await runApplyAgent({
        jobId: baseJobId,
        url: String(job.data?.url ?? ""),
        enabled: env.PLAYWRIGHT_ENABLED,
        artifactsDir: env.AGENT_ARTIFACTS_DIR,
        allowFinalSubmit: Boolean(job.data?.allowFinalSubmit),
      });

      await saveAgentResult(baseJobId, result);
      await updateJobStatus(baseJobId, "completed");
    }

    await saveRunTimeline(baseJobId, runStart, new Date().toISOString());

    return {
      processedAt: new Date().toISOString(),
      status: job.name === "manual-job-intake" ? "awaiting-approval" : "submitted",
    };
  },
  { connection },
);

const queueEvents = new QueueEvents(env.JOB_QUEUE_NAME, { connection });

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed`, error.message);
  const baseJobId = String(job?.data?.jobId ?? "");
  if (baseJobId) {
    updateJobStatus(baseJobId, "failed", error.message).catch(() => {
      console.error(`Unable to persist failed status for job ${baseJobId}`);
    });
  }
});

queueEvents.on("waiting", ({ jobId }) => {
  console.log(`Job ${jobId} is waiting`);
});

console.log(`Worker running and waiting for jobs on queue ${env.JOB_QUEUE_NAME}...`);
