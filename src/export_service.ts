import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError, createInfrai } from "./infrai_client.js";
import { exportMatter, exportRequestSchema } from "./matter_export.js";

const port = Number(process.env.PORT ?? "3000");
const bucket = process.env.INFRAI_EXPORT_BUCKET ?? "legal-matter-exports";
const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const infrai = createInfrai(apiKey);

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/matter-exports") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = exportRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    send(response, 201, await exportMatter(input, infrai, bucket));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "Invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, message: error.message });
      return;
    }
    send(response, 502, { error: "Export could not be completed" });
  }
}).listen(port, () => console.log(`Matter export service listening on http://localhost:${port}`));
