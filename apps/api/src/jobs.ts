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

export type JobStatus = "queued" | "processing" | "completed" | "failed";

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
  retries: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

type JobStore = {
  jobs: JobRecord[];
};

const manualJobSchema = z.object({
  url: z.url(),
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
    retries: 0,
    createdAt: now,
    updatedAt: now,
  };

  store.jobs.push(record);
  await writeJobStore(store);

  await queue.add(
    "manual-job-intake",
    {
      jobId: record.id,
      userId: record.userId,
      url: record.url,
    },
    {
      jobId: record.id,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 200,
      removeOnFail: 200,
    },
  );

  res.status(201).json({ job: record, queued: true });
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
