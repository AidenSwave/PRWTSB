export type BlockKind = "character" | "action" | "choice" | "delay" | "audio" | "sequence" | "scene" | "condition" | "variable" | "nofade" | "socket" | "raw";
export type ScriptBlock = { id: string; kind: BlockKind; raw: string; title?: string; tag?: string; shot?: string; lines?: string[]; body?: string; commands?: string[]; expanded?: boolean };

const commandKind = (line: string): BlockKind | null => {
  const value = line.trim();
  if (/^\[Delay\b/i.test(value)) return "delay";
  if (/^@audio\b/i.test(value)) return "audio";
  if (/^@sequence\b/i.test(value)) return "sequence";
  if (/^@scene\b/i.test(value)) return "scene";
  if (/^\[NoFade\]$/i.test(value)) return "nofade";
  if (/^\/Socket\b|^Continue\s*:/i.test(value)) return "socket";
  if (/^\[[A-Za-z_]\w*\s*[<>]/.test(value)) return "condition";
  if (/^\[[A-Za-z_]\w*\s*[=+-]/.test(value)) return "variable";
  return null;
};

const isSpeaker = (line: string, next: string) => {
  const value = line.trim().replace(/\[[^\]]+\]\s*$/, "").trim();
  return value.length > 0 && value.length < 60 && /^[A-Za-z0-9_' -]+$/.test(value) && !/[.!?,:;]/.test(value) && (/^\[(?:Solo|Wide|Closeup)\]$/i.test(next.trim()) || /^[A-Z][A-Za-z0-9_' -]*(?:\[[^\]]+\])?$/.test(line.trim()));
};

export function parseScreenplay(text: string): ScriptBlock[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ScriptBlock[] = [];
  let pendingCommands: string[] = [];
  let id = 0;
  const push = (block: Omit<ScriptBlock, "id">) => blocks.push({ id: `b${id++}`, ...block });
  for (let i = 0; i < lines.length;) {
    const raw = lines[i], value = raw.trim();
    if (!value) { i++; continue; }
    const kind = commandKind(value);
    if (/^@(?:stage|video|add)\b/i.test(value) || /^\[(?:CUT TO BLACK|Fade In|Blur Out|\.\.\.)/i.test(value)) { push({ kind: "raw", raw }); i++; continue; }
    if (kind && kind !== "socket") { pendingCommands.push(raw); i++; continue; }
    if (kind === "socket") { push({ kind, raw }); i++; continue; }
    if (/^[*-]\s*/.test(value)) {
      const collected = [raw]; let depth = (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
      while (depth > 0 && ++i < lines.length) { collected.push(lines[i]); depth += (lines[i].match(/{/g) || []).length - (lines[i].match(/}/g) || []).length; }
      const header = value.replace(/^[*-]\s*/, "").replace(/\s*{\s*$/, "").trim();
      const body = collected.slice(1).join("\n").replace(/\n?\s*}\s*$/, "");
      push({ kind: "choice", raw: collected.join("\n"), title: header, body, commands: pendingCommands }); pendingCommands = []; i++; continue;
    }
    if (isSpeaker(raw, lines[i + 1] || "")) {
      const match = value.match(/^(.*?)(\[[^\]]+\])?$/)!; const title = match[1].trim(); const tag = match[2] || "";
      let shot = ""; i++;
      if (/^\[(Solo|Wide|Closeup)\]$/i.test((lines[i] || "").trim())) shot = lines[i++].trim();
      const speech: string[] = [];
      while (i < lines.length && lines[i].trim() && !commandKind(lines[i]) && !/^[*-]\s*/.test(lines[i].trim()) && !isSpeaker(lines[i], lines[i + 1] || "")) speech.push(lines[i++].trim());
      push({ kind: "character", raw: [raw, shot, ...speech].filter(Boolean).join("\n"), title, tag, shot, lines: speech, commands: pendingCommands }); pendingCommands = []; continue;
    }
    const action: string[] = [value.replace(/^;/, "")]; i++;
    while (i < lines.length && lines[i].trim() && !commandKind(lines[i]) && !/^[*-]\s*/.test(lines[i].trim()) && !isSpeaker(lines[i], lines[i + 1] || "")) action.push(lines[i++].trim().replace(/^;/, ""));
    push({ kind: "action", raw: action.join("\n"), lines: action, commands: pendingCommands }); pendingCommands = [];
  }
  pendingCommands.forEach(raw => push({ kind: commandKind(raw) || "raw", raw }));
  return blocks;
}

export function serializeBlocks(blocks: ScriptBlock[]): string {
  return blocks.map(block => {
    const commands = block.commands?.length ? `${block.commands.join("\n")}\n\n` : "";
    if (block.kind === "character") return `${commands}${block.title}${block.tag || ""}\n${block.shot ? `${block.shot}\n` : ""}${(block.lines || []).join("\n")}`;
    if (block.kind === "action") return `${commands};${(block.lines || []).join("\n")}`;
    if (block.kind === "choice") return `${commands}* ${block.title}${block.body?.trim() ? `{\n${block.body}\n}` : ""}`;
    return block.raw;
  }).join("\n\n");
}

export function delayParts(raw: string) { const m = raw.match(/\[Delay\s+(\d+(?:\.\d+)?)\s*(ms|s)\]/i); return { value: Number(m?.[1] || 1), unit: m?.[2] || "s" }; }
export function assetParts(raw: string, directive: string) { const value = raw.replace(new RegExp(`^@${directive}\\s+`, "i"), ""); const name = value.replace(/\s+\[[^\]]+\].*$/, ""); return { name, modifiers: value.slice(name.length).trim() }; }
