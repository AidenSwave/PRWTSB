import type { EditorMetadata, Passage, SocketMeta, Story } from "./types";

const EMPTY_METADATA: EditorMetadata = { version: 1, groups: [], routes: [], sockets: [], collapsedChoices: [] };
const META_RE = /<script\s+id=["']script-editor-metadata["']\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i;

const decode = (value: string) => value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const encodeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const encodeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function attributes(source: string) {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) result[match[1]] = decode(match[2] ?? match[3] ?? "");
  return result;
}

export function parseStory(html: string): Story {
  const block = html.match(/<tw-storydata\b([^>]*)>([\s\S]*?)<\/tw-storydata>/i);
  if (!block) throw new Error("This file does not contain Twine <tw-storydata>.");
  const passages: Passage[] = [];
  for (const match of block[2].matchAll(/<tw-passagedata\b([^>]*)>([\s\S]*?)<\/tw-passagedata>/gi)) {
    const attr = attributes(match[1]);
    const [x, y] = (attr.position || "0,0").split(",").map(Number);
    passages.push({ pid: attr.pid || String(passages.length + 1), name: attr.name || "Untitled Passage", tags: attr.tags || "", position: { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }, size: attr.size || "100,100", text: decode(match[2]), attributes: attr });
  }
  let metadata: EditorMetadata = structuredClone(EMPTY_METADATA);
  const metadataMatch = html.match(META_RE);
  if (metadataMatch) {
    try { metadata = { ...metadata, ...JSON.parse(decode(metadataMatch[1])) }; } catch { /* Invalid editor data must not block the story. */ }
  }
  metadata.sockets = reconcileSockets(passages, metadata.sockets || []);
  return { html, storyAttributes: attributes(block[1]), passages, metadata };
}

function passageHtml(p: Passage) {
  const attrs = { ...p.attributes, pid: p.pid, name: p.name, tags: p.tags, position: `${Math.round(p.position.x)},${Math.round(p.position.y)}`, size: p.size || "100,100" };
  return `<tw-passagedata ${Object.entries(attrs).map(([key,value]) => `${key}="${encodeAttribute(value)}"`).join(" ")}>${encodeText(p.text)}</tw-passagedata>`;
}

export function serializeStory(story: Story): string {
  const block = story.html.match(/<tw-storydata\b([^>]*)>([\s\S]*?)<\/tw-storydata>/i);
  if (!block || block.index === undefined) throw new Error("The original story container was lost.");
  let inner = block[2];
  const first = inner.search(/<tw-passagedata\b/i);
  const matches = [...inner.matchAll(/<tw-passagedata\b[^>]*>[\s\S]*?<\/tw-passagedata>/gi)];
  const last = matches.length ? (matches.at(-1)!.index! + matches.at(-1)![0].length) : first;
  const rendered = story.passages.map(passageHtml).join("\n");
  inner = first >= 0 ? inner.slice(0, first) + rendered + inner.slice(last) : inner + rendered;
  const storyAttrs = Object.entries(story.storyAttributes).map(([key,value]) => `${key}="${encodeAttribute(value)}"`).join(" ");
  const replacement = `<tw-storydata ${storyAttrs}>${inner}</tw-storydata>`;
  let output = story.html.slice(0, block.index) + replacement + story.html.slice(block.index + block[0].length);
  const metadataTag = `<script id="script-editor-metadata" type="application/json">${encodeText(JSON.stringify(story.metadata))}</script>`;
  output = output.match(META_RE)
    ? output.replace(META_RE, metadataTag)
    : /<\/body>/i.test(output) ? output.replace(/<\/body>/i, `${metadataTag}\n</body>`) : `${output}\n${metadataTag}`;
  return output;
}

export function socketDirectives(text: string): { id: string; label: string; target?: string }[] {
  const sockets: { id: string; label: string; target?: string }[] = [];
  let index = 0;
  let context = "";
  for (const line of text.split(/\r?\n/)) {
    const choiceContext = line.trim().match(/^\*\s+(.+?)(?:\s*{)?$/);
    const conditionContext = line.trim().match(/^\[([A-Za-z_]\w*\s*(?:>=|<=|>|<|==|!=)\s*[^\]]+)\]$/);
    if (choiceContext) context = choiceContext[1].replace(/\s*{\s*$/, "").trim();
    else if (conditionContext) context = conditionContext[1];
    const socket = line.trim().match(/^\/Socket(?:\s+([^\-]+?))?(?:\s*->\s*\[\[([^\]]+)\]\])?\s*$/i);
    const legacy = line.trim().match(/^Continue\s*:\s*\[\[([^\]]*)\]\]\s*$/i);
    if (socket) sockets.push({ id: `socket-${index++}`, label: socket[1]?.trim() || "Continue", target: socket[2]?.trim() });
    else if (legacy) sockets.push({ id: `socket-${index++}`, label: context || "Continue", target: legacy[1].trim() || undefined });
  }
  return sockets;
}

function reconcileSockets(passages: Passage[], saved: SocketMeta[]): SocketMeta[] {
  const colors = ["#66d9c8", "#7ea7ff", "#c794f5", "#ff9f7d", "#f5cf6b", "#78c98c"];
  const existing = new Map(saved.map(s => [`${s.passageId}:${s.id}`, s]));
  return passages.flatMap(p => socketDirectives(p.text).map((socket, index) => ({
    ...existing.get(`${p.pid}:${socket.id}`), id: socket.id, passageId: p.pid,
    label: socket.label, target: socket.target, color: existing.get(`${p.pid}:${socket.id}`)?.color || colors[index % colors.length]
  })));
}

export function syncStorySockets(story: Story): Story {
  return { ...story, metadata: { ...story.metadata, sockets: reconcileSockets(story.passages, story.metadata.sockets) } };
}

export function setSocketTarget(text: string, socketIndex: number, target: string): string {
  let found = -1;
  return text.split(/\r?\n/).map(line => {
    if (!/^\s*(?:\/Socket\b|Continue\s*:)/i.test(line)) return line;
    found++;
    if (found !== socketIndex) return line;
    const socket = line.trim().match(/^\/Socket(?:\s+([^\-]+?))?(?:\s*->.*)?$/i);
    return socket ? `/Socket ${socket[1]?.trim() || "Continue"} -> [[${target}]]` : `Continue: [[${target}]]`;
  }).join("\n");
}

export function passageLinks(text: string): string[] {
  const links: string[] = [];
  const ordinaryText = text.split(/\r?\n/).filter(line => !/^\s*(?:\/Socket\b|Continue\s*:)/i.test(line)).join("\n");
  for (const match of ordinaryText.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const raw = match[1].trim();
    const target = raw.includes("->") ? raw.split("->").at(-1)! : raw.includes("<-") ? raw.split("<-")[0] : raw.includes("|") ? raw.split("|").at(-1)! : raw;
    if (target.trim()) links.push(target.trim());
  }
  return links;
}
