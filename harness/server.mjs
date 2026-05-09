import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");

const port = Number.parseInt(process.env.PORT || "8787", 10);
const host = process.env.HOST || "127.0.0.1";
const ds4BaseUrl = (process.env.DS4_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const ds4ApiKey = process.env.DS4_API_KEY || "dsv4-local";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: ["system", "user", "assistant", "tool"].includes(message.role) ? message.role : "user",
      content: message.content,
    }));
}

async function proxyChat(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    sendJson(res, 400, { error: "Request body must be valid JSON." });
    return;
  }

  const messages = normalizeMessages(body.messages);
  if (messages.length === 0) {
    sendJson(res, 400, { error: "Add at least one message." });
    return;
  }

  const maxTokens = Math.max(1, Math.min(Number.parseInt(body.max_tokens || "1024", 10), 8192));
  const payload = {
    model: body.model || "deepseek-v4-flash",
    messages,
    stream: true,
    max_tokens: maxTokens,
  };

  if (body.think === false) payload.think = false;
  if (body.reasoning_effort) payload.reasoning_effort = body.reasoning_effort;

  const upstream = await fetch(`${ds4BaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ds4ApiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number.parseInt(process.env.DS4_REQUEST_TIMEOUT_MS || "900000", 10)),
  }).catch((error) => ({ ok: false, status: 502, text: async () => error.message }));

  if (!upstream.ok || !upstream.body) {
    const text = typeof upstream.text === "function" ? await upstream.text() : "DS4 server unavailable.";
    sendJson(res, upstream.status || 502, {
      error: "DS4 server request failed.",
      detail: text,
      ds4BaseUrl,
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  const reader = upstream.body.getReader();
  req.on("close", () => reader.cancel().catch(() => {}));

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
}

async function proxyModels(_req, res) {
  const upstream = await fetch(`${ds4BaseUrl}/v1/models`).catch((error) => ({
    ok: false,
    status: 502,
    text: async () => error.message,
  }));

  if (!upstream.ok) {
    sendJson(res, upstream.status || 502, {
      ok: false,
      error: await upstream.text(),
      ds4BaseUrl,
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(await upstream.text());
}

async function serveStatic(urlPath, res) {
  const safePath = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, ds4BaseUrl });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/models") {
      await proxyModels(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      await proxyChat(req, res);
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`DS4 harness: http://${host}:${port}`);
  console.log(`Proxying DS4: ${ds4BaseUrl}`);
});
