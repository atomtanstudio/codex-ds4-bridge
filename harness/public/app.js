const els = {
  status: document.querySelector("#status"),
  systemPrompt: document.querySelector("#systemPrompt"),
  maxTokens: document.querySelector("#maxTokens"),
  thinkingMode: document.querySelector("#thinkingMode"),
  newChat: document.querySelector("#newChat"),
  stop: document.querySelector("#stop"),
  ping: document.querySelector("#ping"),
  messages: document.querySelector("#messages"),
  composer: document.querySelector("#composer"),
  prompt: document.querySelector("#prompt"),
  send: document.querySelector("#send"),
};

let messages = [];
let controller = null;

function setStatus(text, ok = true) {
  els.status.textContent = text;
  els.status.style.color = ok ? "var(--muted)" : "var(--danger)";
}

function renderEmpty() {
  if (messages.length > 0) return;
  els.messages.innerHTML = '<div class="empty">Start a local DS4 chat when the server is running on port 8000.</div>';
}

function appendMessage(role, content = "") {
  const node = document.createElement("article");
  node.className = `message ${role}`;
  node.innerHTML = `<span class="role">${role}</span><div class="content"></div>`;
  node.querySelector(".content").textContent = content;
  els.messages.append(node);
  els.messages.scrollTop = els.messages.scrollHeight;
  return node.querySelector(".content");
}

function currentPayload() {
  const system = els.systemPrompt.value.trim();
  const outgoing = system ? [{ role: "system", content: system }, ...messages] : [...messages];
  const thinking = els.thinkingMode.value;

  return {
    messages: outgoing,
    max_tokens: Number.parseInt(els.maxTokens.value || "1024", 10),
    think: thinking !== "off",
    reasoning_effort: thinking === "off" ? undefined : thinking,
  };
}

function parseSse(buffer, onEvent) {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() || "";

  for (const part of parts) {
    const data = part
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (data) onEvent(data);
  }

  return rest;
}

function extractDelta(json) {
  const delta = json.choices?.[0]?.delta || {};
  return delta.content || delta.reasoning_content || "";
}

async function ping() {
  try {
    const res = await fetch("/api/models");
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const model = data.data?.[0]?.id || "DS4";
    setStatus(`${model} reachable`);
  } catch {
    setStatus("DS4 server offline", false);
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const text = els.prompt.value.trim();
  if (!text || controller) return;

  if (messages.length === 0) els.messages.innerHTML = "";
  messages.push({ role: "user", content: text });
  appendMessage("user", text);
  els.prompt.value = "";

  const payload = currentPayload();
  const assistantMessage = { role: "assistant", content: "" };
  messages.push(assistantMessage);
  const assistantNode = appendMessage("assistant", "");

  controller = new AbortController();
  els.stop.disabled = false;
  els.send.disabled = true;
  setStatus("Generating...");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const detail = await res.text();
      throw new Error(detail || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSse(buffer, (data) => {
        if (data === "[DONE]") return;
        try {
          const delta = extractDelta(JSON.parse(data));
          if (delta) {
            assistantMessage.content += delta;
            assistantNode.textContent = assistantMessage.content;
            els.messages.scrollTop = els.messages.scrollHeight;
          }
        } catch {
          // Ignore partial or non-JSON SSE events.
        }
      });
    }

    setStatus("Ready");
  } catch (error) {
    if (error.name !== "AbortError") {
      assistantMessage.content = `Request failed: ${error.message}`;
      assistantNode.textContent = assistantMessage.content;
      setStatus("Request failed", false);
    } else {
      setStatus("Stopped");
    }
  } finally {
    controller = null;
    els.stop.disabled = true;
    els.send.disabled = false;
    els.prompt.focus();
  }
}

els.composer.addEventListener("submit", sendMessage);
els.ping.addEventListener("click", ping);
els.stop.addEventListener("click", () => controller?.abort());
els.newChat.addEventListener("click", () => {
  messages = [];
  els.messages.innerHTML = "";
  renderEmpty();
  els.prompt.focus();
});
els.prompt.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    els.composer.requestSubmit();
  }
});

renderEmpty();
ping();
