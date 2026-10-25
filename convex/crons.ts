import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Dashboard: bring in Apify's record of our Actor's runs.
crons.interval("sync apify runs", { minutes: 15 }, internal.metrics.syncApify, {});

export default crons;
