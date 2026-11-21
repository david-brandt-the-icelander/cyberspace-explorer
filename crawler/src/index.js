// cyberspace-crawler: a Worker with no public routes. A schedule sends due addresses to the scan queue; the queue's consumer
// scans them. The explorer's Worker shares its database and bucket, and adds rescans to the same queue (crawler/README.md).

import { dueAddresses, requestScan } from "./store.js";
import { runScan } from "./scan.js";

export default {
  /** Every few minutes: queue the addresses whose interval has passed. */
  async scheduled(event, env, ctx) {
    const due = await dueAddresses(env.DB, new Date(event.scheduledTime ?? Date.now()));
    let sent = 0;
    for (const id of due) if (await requestScan(env.DB, env.SCANS, id, "schedule")) sent++;
    console.log(JSON.stringify({ event: "schedule", due: due.length, sent }));
  },

  /** Scans the addresses in a batch of queue messages, one at a time so one host is never asked twice at once. */
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        const result = await runScan(env, message.body);
        console.log(JSON.stringify({ event: "scan", ...result }));
        message.ack();
      } catch (e) {
        console.log(JSON.stringify({ event: "scan-error", id: message.body?.id, error: String(e) }));
        message.retry({ delaySeconds: 300 });
      }
    }
  },

  /** Only a health check: everything else is reached through the explorer's Worker. */
  async fetch(request) {
    return new URL(request.url).pathname === "/health" ? new Response("ok") : new Response("Not found", { status: 404 });
  },
};
