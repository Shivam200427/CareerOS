import { QueueEvents, Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./env.js";

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  "job-apply-queue",
  async (job) => {
    console.log(`Processing job ${job.id}`, job.name, job.data);
    return {
      processedAt: new Date().toISOString(),
      status: "queued-for-next-phase",
    };
  },
  { connection },
);

const queueEvents = new QueueEvents("job-apply-queue", { connection });

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`Job ${job?.id} failed`, error.message);
});

queueEvents.on("waiting", ({ jobId }) => {
  console.log(`Job ${jobId} is waiting`);
});

console.log("Worker running and waiting for jobs...");
