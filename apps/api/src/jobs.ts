import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import type { Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "./auth-middleware.js";
import { env } from "./env.js";

type ResumeStore = {
  resumes: Array<{
    id: string;
    userId: string;
    isPinned: boolean;
    parsedData?: {
      skills?: string[];
    };
  }>;
};

export type JobStatus =
  | "queued"
  | "processing"
  | "awaiting_approval"
  | "approved"
  | "completed"
  | "skipped"
  | "failed";

export type JobRecord = {
  id: string;
  userId: string;
  url: string;
  source: "manual";
  status: JobStatus;
  title: string;
  company: string;
  summary: string;
  parsedSkills: string[];
  matchScore: number;
  allowFinalSubmit: boolean;
  retries: number;
  lastError?: string;
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
  agentRun?: {
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
  };
  createdAt: string;
  updatedAt: string;
};

type JobStore = {
  jobs: JobRecord[];
};

type QueueJobName = "manual-job-intake" | "manual-job-submit";

const manualJobSchema = z.object({
  url: z.url(),
});

const setSubmitModeSchema = z.object({
  allowFinalSubmit: z.boolean(),
});

const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(env.JOB_QUEUE_NAME, { connection: redis });

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const jobsDbPath = path.resolve(repoRoot, env.JOB_DB_FILE);
const resumeDbPath = path.resolve(repoRoot, env.RESUME_DB_FILE);

let writeQueue = Promise.resolve();

async function ensureStoreReady() {
  await fs.mkdir(path.dirname(jobsDbPath), { recursive: true });
  try {
    await fs.access(jobsDbPath);
  } catch {
    const initial: JobStore = { jobs: [] };
    await fs.writeFile(jobsDbPath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readJobStore(): Promise<JobStore> {
  await ensureStoreReady();
  const raw = await fs.readFile(jobsDbPath, "utf-8");
  return JSON.parse(raw) as JobStore;
}

async function updateJobRecord(
  jobId: string,
  userId: string,
  updater: (job: JobRecord) => JobRecord,
) {
  const store = await readJobStore();
  const index = store.jobs.findIndex((job) => job.id === jobId && job.userId === userId);
  if (index === -1) {
    return null;
  }

  const updated = updater(store.jobs[index]);
  store.jobs[index] = {
    ...updated,
    updatedAt: new Date().toISOString(),
  };

  await writeJobStore(store);
  return store.jobs[index];
}

function writeJobStore(store: JobStore) {
  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(jobsDbPath, JSON.stringify(store, null, 2), "utf-8");
  });
  return writeQueue;
}

async function readPinnedResumeSkills(userId: string) {
  try {
    const raw = await fs.readFile(resumeDbPath, "utf-8");
    const store = JSON.parse(raw) as ResumeStore;
    const pinned = store.resumes.find((resume) => resume.userId === userId && resume.isPinned);
    return (pinned?.parsedData?.skills ?? []).map((skill) => skill.toLowerCase());
  } catch {
    return [];
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveSkills(text: string) {
  const lexicon = [
    "javascript",
    "typescript",
    "node",
    "react",
    "python",
    "java",
    "mongodb",
    "redis",
    "sql",
    "aws",
    "docker",
    "kubernetes",
    "playwright",
    "express",
    "tailwind",
  ];
  const lower = text.toLowerCase();
  return lexicon.filter((word) => lower.includes(word));
}

function extractTitleFromHtml(html: string, url: URL) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!match) {
    return `Role at ${url.hostname}`;
  }
  return match[1].replace(/\s+/g, " ").trim().slice(0, 120);
}

function extractCompany(url: URL) {
  const host = url.hostname.replace(/^www\./, "");
  return host.split(".")[0] ?? host;
}

function computeScore(jobSkills: string[], resumeSkills: string[]) {
  if (resumeSkills.length === 0 || jobSkills.length === 0) {
    return 35;
  }

  const required = new Set(jobSkills);
  let hit = 0;
  for (const skill of resumeSkills) {
    if (required.has(skill)) {
      hit += 1;
    }
  }

  return Math.min(100, Math.round((hit / required.size) * 100));
}

async function parseJobPage(jobUrl: string) {
  const parsedUrl = new URL(jobUrl);
  const response = await fetch(parsedUrl, {
    signal: AbortSignal.timeout(12000),
    headers: {
      "user-agent": "CareerOS-JobAgent/0.1 (+manual-intake)",
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch page (${response.status})`);
  }

  const html = await response.text();
  const text = stripHtml(html);
  const title = extractTitleFromHtml(html, parsedUrl);
  const company = extractCompany(parsedUrl);
  const parsedSkills = deriveSkills(text);

  return {
    title,
    company,
    parsedSkills,
    summary: text.slice(0, 550),
  };
}

export async function postManualJob(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parseBody = manualJobSchema.safeParse(req.body);
  if (!parseBody.success) {
    res.status(400).json({ message: "Invalid payload. Expected a valid URL." });
    return;
  }

  const { url } = parseBody.data;
  const store = await readJobStore();
  const existing = store.jobs.find((job) => job.userId === req.user?.id && job.url === url);
  if (existing) {
    res.json({ job: existing, queued: false, message: "Job already in queue/history." });
    return;
  }

  let parsed;
  try {
    parsed = await parseJobPage(url);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Unable to parse job URL",
    });
    return;
  }

  const resumeSkills = await readPinnedResumeSkills(req.user.id);
  const matchScore = computeScore(parsed.parsedSkills, resumeSkills);

  const now = new Date().toISOString();
  const record: JobRecord = {
    id: randomUUID(),
    userId: req.user.id,
    url,
    source: "manual",
    status: "queued",
    title: parsed.title,
    company: parsed.company,
    summary: parsed.summary,
    parsedSkills: parsed.parsedSkills,
    matchScore,
    allowFinalSubmit: false,
    retries: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.jobs.push(record);
  await writeJobStore(store);

  await enqueueJob("manual-job-intake", record.id, record.userId, record.url);

  res.status(201).json({ job: record, queued: true });
}

async function enqueueJob(name: QueueJobName, jobId: string, userId: string, url: string) {
  const store = await readJobStore();
  const current = store.jobs.find((job) => job.id === jobId && job.userId === userId);
  const allowFinalSubmit = current?.allowFinalSubmit ?? false;

  await queue.add(
    name,
    {
      jobId,
      userId,
      url,
      allowFinalSubmit,
    },
    {
      jobId: `${jobId}:${name}`,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 200,
      removeOnFail: 200,
    },
  );
}

export async function getJobs(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const store = await readJobStore();
  const jobs = store.jobs
    .filter((job) => job.userId === req.user?.id)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  res.json({ jobs });
}

export async function getDiscoverJobsPlaceholder(_req: AuthenticatedRequest, res: Response) {
  res.status(501).json({
    message: "Auto-discovery is planned for a later milestone. Use POST /api/jobs/manual for now.",
  });
}

export async function postApproveJob(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const user = req.user;
  const jobId = String(req.params.jobId ?? "");
  if (!jobId) {
    res.status(400).json({ message: "Missing job id" });
    return;
  }

  const store = await readJobStore();
  const current = store.jobs.find((job) => job.id === jobId && job.userId === user.id);
  if (!current) {
    res.status(404).json({ message: "Job not found" });
    return;
  }

  if (current.status !== "awaiting_approval") {
    res.status(400).json({ message: "Only jobs awaiting approval can be approved" });
    return;
  }

  const updated = await updateJobRecord(jobId, user.id, (job) => {
    return {
      ...job,
      status: "approved",
      lastError: undefined,
    };
  });

  if (!updated) {
    res.status(404).json({ message: "Job not found" });
    return;
  }

  res.json({ job: updated, queued: false, message: "Approved. Use execute action to run submit stage." });
}

export async function postSkipJob(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const user = req.user;
  const jobId = String(req.params.jobId ?? "");
  if (!jobId) {
    res.status(400).json({ message: "Missing job id" });
    return;
  }

  const store = await readJobStore();
  const current = store.jobs.find((job) => job.id === jobId && job.userId === user.id);
  if (!current) {
    res.status(404).json({ message: "Job not found" });
    return;
  }

  if (current.status !== "awaiting_approval") {
    res.status(400).json({ message: "Only jobs awaiting approval can be skipped" });
    return;
  }

  const updated = await updateJobRecord(jobId, user.id, (job) => {
    return {
      ...job,
      status: "skipped",
    };
  });

  if (!updated) {
    res.status(404).json({ message: "Job not found" });
    return;
  }

  res.json({ job: updated });
}

export async function postExecuteJob(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const user = req.user;
  const jobId = String(req.params.jobId ?? "");
  if (!jobId) {
    res.status(400).json({ message: "Missing job id" });
    return;
  }

  const store = await readJobStore();
  const current = store.jobs.find((job) => job.id === jobId && job.userId === user.id);
  if (!current) {
    res.status(404).json({ message: "Job not found" });
    return;
  }

  if (current.status !== "approved") {
    res.status(400).json({ message: "Only approved jobs can be executed" });
    return;
  }

  const updated = await updateJobRecord(jobId, user.id, (job) => ({
    ...job,
    status: "queued",
    lastError: undefined,
  }));

  if (!updated) {
    res.status(404).json({ message: "Job not found" });
    return;
  }

  await enqueueJob("manual-job-submit", updated.id, updated.userId, updated.url);

  res.json({ job: updated, queued: true, message: "Submit stage started" });
}

export async function postSetSubmitMode(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const user = req.user;
  const jobId = String(req.params.jobId ?? "");
  if (!jobId) {
    res.status(400).json({ message: "Missing job id" });
    return;
  }

  const parsedBody = setSubmitModeSchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ message: "Invalid payload. Expected allowFinalSubmit boolean." });
    return;
  }

  const updated = await updateJobRecord(jobId, user.id, (job) => ({
    ...job,
    allowFinalSubmit: parsedBody.data.allowFinalSubmit,
  }));

  if (!updated) {
    res.status(404).json({ message: "Job not found" });
    return;
  }

  res.json({ job: updated });
}

export async function getJobArtifact(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const user = req.user;
  const jobId = String(req.params.jobId ?? "");
  if (!jobId) {
    res.status(400).json({ message: "Missing job id" });
    return;
  }

  const store = await readJobStore();
  const target = store.jobs.find((job) => job.id === jobId && job.userId === user.id);
  if (!target) {
    res.status(404).json({ message: "Job not found" });
    return;
  }

  const artifactPath = target.agentResult?.artifactPath;
  if (!artifactPath) {
    res.status(404).json({ message: "No artifact available for this job yet" });
    return;
  }

  try {
    await fs.access(artifactPath);
  } catch {
    res.status(404).json({ message: "Artifact file not found on disk" });
    return;
  }

  res.download(artifactPath, `${jobId}-run.json`);
}
