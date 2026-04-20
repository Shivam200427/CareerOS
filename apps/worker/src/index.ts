import { QueueEvents, Worker } from "bullmq";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import { env } from "./env.js";

type JobStatus = "queued" | "processing" | "completed" | "failed";

type JobStore = {
  jobs: Array<{
    id: string;
    status: JobStatus;
    retries: number;
    lastError?: string;
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

const worker = new Worker(
  env.JOB_QUEUE_NAME,
  async (job) => {
    console.log(`Processing job ${job.id}`, job.name, job.data);

    await updateJobStatus(String(job.id), "processing");

    await new Promise((resolve) => {
      setTimeout(resolve, 900);
    });

    await updateJobStatus(String(job.id), "completed");

    return {
      processedAt: new Date().toISOString(),
      status: "parsed-and-queued-for-agent",
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
  if (job?.id) {
    updateJobStatus(String(job.id), "failed", error.message).catch(() => {
      console.error(`Unable to persist failed status for job ${job.id}`);
    });
  }
});

queueEvents.on("waiting", ({ jobId }) => {
  console.log(`Job ${jobId} is waiting`);
});

console.log(`Worker running and waiting for jobs on queue ${env.JOB_QUEUE_NAME}...`);
