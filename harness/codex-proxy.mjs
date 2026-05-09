import { createServer } from "node:http";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "8788", 10);
const ds4BaseUrl = (process.env.DS4_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const apiKey = process.env.DS4_API_KEY || "dsv4-local";
const requestLogPath = process.env.DS4_PROXY_REQUEST_LOG || join(process.cwd(), "logs", "codex-proxy-requests.log");
const forwardTools = process.env.DS4_CODEX_FORWARD_TOOLS === "1";

function logRequest(req, url) {
  const stamp = new Date().toISOString();
  const line = `${stamp} ${req.method} ${url.pathname}\n`;
  console.log(line.trimEnd());
  try {
    mkdirSync(dirname(requestLogPath), { recursive: true });
    appendFileSync(requestLogPath, line);
  } catch {
  }
}

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
  return raw.trim() ? JSON.parse(raw) : {};
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "input_text" || part?.type === "output_text" || part?.type === "text") {
        return part.text || "";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function responsesInputToMessages(body) {
  const messages = [];
  const instructions = textFromContent(body.instructions);
  if (instructions) messages.push({ role: "system", content: instructions });

  const input = Array.isArray(body.input) ? body.input : [{ role: "user", content: body.input || "" }];
  for (const item of input) {
    if (!item) continue;

    if (item.type === "message" || item.role) {
      const role = item.role === "developer" ? "system" : item.role || "user";
      const content = textFromContent(item.content);
      if (content) messages.push({ role, content });
      continue;
    }

    if (item.type === "function_call_output") {
      messages.push({
        role: "tool",
        tool_call_id: item.call_id || item.id || "tool_call",
        content: textFromContent(item.output),
      });
      continue;
    }

    if (item.type === "function_call") {
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: item.call_id || item.id || "tool_call",
            type: "function",
            function: {
              name: item.name || "unknown_tool",
              arguments: item.arguments || "{}",
            },
          },
        ],
      });
    }
  }

  return messages.length ? messages : [{ role: "user", content: "" }];
}

function responsesToolsToChatTools(tools) {
  if (!Array.isArray(tools)) return undefined;
  const converted = tools
    .filter((tool) => tool?.type === "function" || tool?.name)
    .map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.parameters || {},
        strict: tool.strict,
      },
    }))
    .filter((tool) => tool.function.name);
  return converted.length ? converted : undefined;
}

function baseResponse(id, body, status = "in_progress", output = []) {
  return {
    id,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status,
    error: null,
    incomplete_details: null,
    instructions: body.instructions || null,
    max_output_tokens: body.max_output_tokens || body.max_tokens || null,
    model: body.model || "deepseek-v4-flash",
    output,
    parallel_tool_calls: body.parallel_tool_calls ?? true,
    previous_response_id: body.previous_response_id || null,
    reasoning: body.reasoning || null,
    store: body.store ?? false,
    temperature: body.temperature ?? 1,
    text: body.text || { format: { type: "text" } },
    tool_choice: body.tool_choice || "auto",
    tools: body.tools || [],
    top_p: body.top_p ?? 1,
    truncation: body.truncation || "disabled",
    usage: null,
    user: body.user || null,
    metadata: body.metadata || {},
  };
}

function sse(res, event) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function proxyModels(_req, res) {
  const upstream = await fetch(`${ds4BaseUrl}/v1/models`);
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(await upstream.text());
}

async function proxyRaw(req, res, pathname) {
  const upstream = await fetch(`${ds4BaseUrl}${pathname}`, {
    method: req.method,
    headers: {
      "Content-Type": req.headers["content-type"] || "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: req.method === "GET" ? undefined : await new Response(req).arrayBuffer(),
  });
  res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
  if (upstream.body) {
    for await (const chunk of upstream.body) res.write(Buffer.from(chunk));
  }
  res.end();
}

async function createResponse(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    sendJson(res, 400, { error: { message: "Invalid JSON request body." } });
    return;
  }

  const responseId = `resp_ds4_${Date.now().toString(36)}`;
  const messageId = `msg_ds4_${Date.now().toString(36)}`;
  const tools = forwardTools ? responsesToolsToChatTools(body.tools) : undefined;
  const payload = {
    model: body.model || "deepseek-v4-flash",
    messages: responsesInputToMessages(body),
    max_tokens: body.max_output_tokens || body.max_tokens || 2048,
    temperature: body.temperature,
    top_p: body.top_p,
    stream: Boolean(body.stream),
    tools,
    tool_choice: tools ? body.tool_choice : undefined,
    think: process.env.DS4_CODEX_THINK === "1",
  };

  if (payload.think && body.reasoning?.effort) payload.reasoning_effort = body.reasoning.effort;

  const upstream = await fetch(`${ds4BaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    sendJson(res, upstream.status, {
      error: {
        message: await upstream.text(),
        type: "ds4_upstream_error",
      },
    });
    return;
  }

  if (!body.stream) {
    const chat = await upstream.json();
    const message = chat.choices?.[0]?.message || {};
    const text = message.content || "";
    const output = [];
    if (text) {
      output.push({
        id: messageId,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      });
    }
    for (const toolCall of message.tool_calls || []) {
      output.push({
        id: toolCall.id || `fc_${Date.now().toString(36)}`,
        type: "function_call",
        status: "completed",
        call_id: toolCall.id || `call_${Date.now().toString(36)}`,
        name: toolCall.function?.name || "unknown_tool",
        arguments: toolCall.function?.arguments || "{}",
      });
    }
    const response = baseResponse(responseId, body, "completed", output);
    response.usage = chat.usage || null;
    sendJson(res, 200, response);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  let seq = 1;
  let text = "";
  let nextOutputIndex = 0;
  let textOutputIndex = null;
  let textStarted = false;
  const toolCalls = new Map();
  const output = [];
  const response = baseResponse(responseId, body);
  sse(res, { type: "response.created", response, sequence_number: seq++ });
  sse(res, { type: "response.in_progress", response, sequence_number: seq++ });

  const startText = () => {
    if (textStarted) return;
    textStarted = true;
    textOutputIndex = nextOutputIndex++;
    sse(res, {
      type: "response.output_item.added",
      output_index: textOutputIndex,
      item: { id: messageId, type: "message", status: "in_progress", role: "assistant", content: [] },
      sequence_number: seq++,
    });
    sse(res, {
      type: "response.content_part.added",
      item_id: messageId,
      output_index: textOutputIndex,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
      sequence_number: seq++,
    });
  };

  const ensureToolCall = (deltaToolCall) => {
    const key = deltaToolCall.index ?? 0;
    const existing = toolCalls.get(key) || {
      id: deltaToolCall.id || `fc_ds4_${Date.now().toString(36)}_${key}`,
      call_id: deltaToolCall.id || `call_ds4_${Date.now().toString(36)}_${key}`,
      name: "",
      arguments: "",
      output_index: nextOutputIndex++,
      added: false,
    };

    if (deltaToolCall.id) {
      existing.id = deltaToolCall.id;
      existing.call_id = deltaToolCall.id;
    }
    if (deltaToolCall.function?.name) existing.name += deltaToolCall.function.name;
    if (deltaToolCall.function?.arguments) existing.arguments += deltaToolCall.function.arguments;

    if (!existing.added && existing.name) {
      existing.added = true;
      sse(res, {
        type: "response.output_item.added",
        output_index: existing.output_index,
        item: {
          id: existing.id,
          type: "function_call",
          status: "in_progress",
          call_id: existing.call_id,
          name: existing.name,
          arguments: "",
        },
        sequence_number: seq++,
      });
    }

    if (existing.added && deltaToolCall.function?.arguments) {
      sse(res, {
        type: "response.function_call_arguments.delta",
        item_id: existing.id,
        output_index: existing.output_index,
        delta: deltaToolCall.function.arguments,
        sequence_number: seq++,
      });
    }

    toolCalls.set(key, existing);
  };

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleData = (data) => {
    if (!data || data === "[DONE]") return;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const choiceDelta = parsed.choices?.[0]?.delta || {};
    for (const toolCall of choiceDelta.tool_calls || []) ensureToolCall(toolCall);

    const delta = choiceDelta.content || "";
    if (!delta) return;
    startText();
    text += delta;
    sse(res, {
      type: "response.output_text.delta",
      response_id: responseId,
      item_id: messageId,
      output_index: textOutputIndex,
      content_index: 0,
      delta,
      sequence_number: seq++,
    });
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (line.startsWith("data:")) handleData(line.slice(5).trimStart());
        }
      }
    }

    if (textStarted) {
      const outputItem = {
        id: messageId,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      };
      output.push(outputItem);
      sse(res, {
        type: "response.output_text.done",
        response_id: responseId,
        item_id: messageId,
        output_index: textOutputIndex,
        content_index: 0,
        text,
        sequence_number: seq++,
      });
      sse(res, {
        type: "response.content_part.done",
        item_id: messageId,
        output_index: textOutputIndex,
        content_index: 0,
        part: { type: "output_text", text, annotations: [] },
        sequence_number: seq++,
      });
      sse(res, { type: "response.output_item.done", output_index: textOutputIndex, item: outputItem, sequence_number: seq++ });
    }

    for (const toolCall of [...toolCalls.values()].sort((a, b) => a.output_index - b.output_index)) {
      if (!toolCall.added) continue;
      const item = {
        id: toolCall.id,
        type: "function_call",
        status: "completed",
        call_id: toolCall.call_id,
        name: toolCall.name || "unknown_tool",
        arguments: toolCall.arguments || "{}",
      };
      output.push(item);
      sse(res, {
        type: "response.function_call_arguments.done",
        item_id: item.id,
        output_index: toolCall.output_index,
        arguments: item.arguments,
        sequence_number: seq++,
      });
      sse(res, { type: "response.output_item.done", output_index: toolCall.output_index, item, sequence_number: seq++ });
    }

    const completed = baseResponse(responseId, body, "completed", output);
    sse(res, { type: "response.completed", response: completed, sequence_number: seq++ });
    res.write("data: [DONE]\n\n");
  } catch (error) {
    sse(res, { type: "error", error: { message: error.message }, sequence_number: seq++ });
  } finally {
    res.end();
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  logRequest(req, url);
  try {
    if (req.method === "GET" && url.pathname === "/v1/models") return await proxyModels(req, res);
    if (req.method === "POST" && url.pathname === "/v1/responses") return await createResponse(req, res);
    if (url.pathname === "/v1/chat/completions" || url.pathname === "/v1/completions") {
      return await proxyRaw(req, res, url.pathname);
    }
    sendJson(res, 404, { error: { message: `unknown endpoint: ${url.pathname}` } });
  } catch (error) {
    sendJson(res, 500, { error: { message: error.message } });
  }
}).listen(port, host, () => {
  console.log(`DS4 Codex proxy: http://${host}:${port}/v1`);
  console.log(`Proxying DS4: ${ds4BaseUrl}`);
});
