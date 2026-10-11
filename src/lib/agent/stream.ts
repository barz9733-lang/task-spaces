import type { AgentEvent } from "./run";

/** Turns an agent event generator into a newline-delimited JSON streaming response. */
export function ndjson(gen: AsyncGenerator<AgentEvent>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of gen) controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
      } catch (e) {
        console.error(e);
        controller.enqueue(enc.encode(JSON.stringify({ type: "error", message: "משהו השתבש בדרך." }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
