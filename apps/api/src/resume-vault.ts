import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Response } from "express";
import multer from "multer";
import type { AuthenticatedRequest } from "./auth-middleware.js";
import { env } from "./env.js";

type ParsedResumeData = {
  summary: string;
  skills: string[];
  keywords: string[];
  experienceYears: number | null;
};

type ResumeRecord = {
  id: string;
  userId: string;
  version: number;
  fileName: string;
  mimeType: string;
  storedPath: string;
  sizeBytes: number;
  parsedData: ParsedResumeData;
  isPinned: boolean;
  uploadedAt: string;
};

type ResumeStore = {
  resumes: ResumeRecord[];
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      callback(new Error("Only PDF, DOCX, DOC, and TXT files are supported"));
      return;
    }

    callback(null, true);
  },
});

const storageDir = path.resolve(process.cwd(), env.RESUME_STORAGE_DIR);
const dbFilePath = path.resolve(process.cwd(), env.RESUME_DB_FILE);
let writeQueue = Promise.resolve();

async function ensureStorageReady() {
  await fs.mkdir(storageDir, { recursive: true });
  await fs.mkdir(path.dirname(dbFilePath), { recursive: true });

  try {
    await fs.access(dbFilePath);
  } catch {
    const initial: ResumeStore = { resumes: [] };
    await fs.writeFile(dbFilePath, JSON.stringify(initial, null, 2), "utf-8");
  }
}

async function readStore(): Promise<ResumeStore> {
  await ensureStorageReady();
  const raw = await fs.readFile(dbFilePath, "utf-8");
  const parsed = JSON.parse(raw) as ResumeStore;
  return parsed;
}

function writeStore(store: ResumeStore) {
  writeQueue = writeQueue.then(async () => {
    await fs.writeFile(dbFilePath, JSON.stringify(store, null, 2), "utf-8");
  });
  return writeQueue;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function uniqueWords(input: string, maxCount: number) {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3);

  const seen = new Set<string>();
  const output: string[] = [];

  for (const token of tokens) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    output.push(token);
    if (output.length >= maxCount) {
      break;
    }
  }

  return output;
}

function parseResumeData(rawText: string): ParsedResumeData {
  const normalized = rawText.replace(/\s+/g, " ").trim();

  const knownSkills = [
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
    "express",
    "playwright",
    "tailwind",
  ];

  const lower = normalized.toLowerCase();
  const skills = knownSkills.filter((skill) => lower.includes(skill));
  const yearsMatch = lower.match(/(\d{1,2})\+?\s+years?/);

  return {
    summary: normalized.slice(0, 320),
    skills,
    keywords: uniqueWords(normalized, 20),
    experienceYears: yearsMatch ? Number(yearsMatch[1]) : null,
  };
}

async function extractText(fileName: string, mimeType: string, buffer: Buffer) {
  const lowerName = fileName.toLowerCase();

  if (mimeType === "text/plain" || lowerName.endsWith(".txt")) {
    return buffer.toString("utf-8");
  }

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
    try {
      const mod = (await import("pdf-parse")) as unknown as {
        default?: (data: Buffer) => Promise<{ text?: string }>;
      };
      const parser = mod.default;
      if (!parser) {
        return "";
      }
      const result = await parser(buffer);
      return result.text ?? "";
    } catch {
      return "";
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? "";
    } catch {
      return "";
    }
  }

  return "";
}

export const resumeUploadMiddleware = upload.single("resume");

export async function postResumeUpload(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ message: "Missing resume file" });
    return;
  }

  const store = await readStore();
  const userResumes = store.resumes.filter((resume) => resume.userId === req.user?.id);
  const version = userResumes.length + 1;

  const resumeId = randomUUID();
  const safeName = sanitizeFileName(file.originalname);
  const storedFileName = `${resumeId}-${safeName}`;
  const storedPath = path.join(storageDir, storedFileName);

  await fs.writeFile(storedPath, file.buffer);

  const extractedText = await extractText(file.originalname, file.mimetype, file.buffer);
  const parsedData = parseResumeData(extractedText);

  const record: ResumeRecord = {
    id: resumeId,
    userId: req.user.id,
    version,
    fileName: file.originalname,
    mimeType: file.mimetype,
    storedPath,
    sizeBytes: file.size,
    parsedData,
    isPinned: userResumes.length === 0,
    uploadedAt: new Date().toISOString(),
  };

  if (record.isPinned) {
    for (const resume of store.resumes) {
      if (resume.userId === req.user.id) {
        resume.isPinned = false;
      }
    }
  }

  store.resumes.push(record);
  await writeStore(store);

  res.status(201).json({ resume: record });
}

export async function getResumes(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const store = await readStore();
  const userResumes = store.resumes
    .filter((resume) => resume.userId === req.user?.id)
    .sort((a, b) => b.version - a.version);

  res.json({ resumes: userResumes });
}

export async function postPinResume(req: AuthenticatedRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const resumeId = req.params.resumeId;
  const store = await readStore();
  const target = store.resumes.find((resume) => resume.id === resumeId && resume.userId === req.user?.id);

  if (!target) {
    res.status(404).json({ message: "Resume not found" });
    return;
  }

  for (const resume of store.resumes) {
    if (resume.userId === req.user.id) {
      resume.isPinned = resume.id === resumeId;
    }
  }

  await writeStore(store);

  res.json({ resume: target });
}
