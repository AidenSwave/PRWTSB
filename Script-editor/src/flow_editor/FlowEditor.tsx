import { useMemo, useState } from "react";
import type { Passage, Story } from "../core/types";

type FlowNode = {
  id: string;
  kind: "narration" | "dialogue" | "choice" | "directive";
  start: number;
  end: number;
  text: string;
  speaker?: string;
  dialogue?: string;
  title?: string;
  body?: string;
  commands?: string[];
};

const stageScenes: Record<string, string[]> = {
  Debug: ["UI"],
  Intro: ["LogoScreen", "Ship_Earth", "Ship_IDLE", "Ship_Jump"],
  Intro_Hospital: ["BedBound", "BedBound_Door", "StandCorner"],
};

const indentWidth = (line: string) => (line.match(/^\s*/)?.[0] || "").replace(/\t/g, "    ").length;
const isSpeaker = (line: string) => indentWidth(line) >= 20 && /^[A-Za-z0-9_' -]{1,60}$/.test(line.trim());
const isDialogue = (line: string) => indentWidth(line) >= 6 && !!line.trim() && !/^[\[*@/]/.test(line.trim());
const isDirective = (line: string) => /^\s*(?:@|\[|\/Socket|Continue\s*:)/i.test(line);

function parseFlow(text: string, offset = 0): FlowNode[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const nodes: FlowNode[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim()) { index++; continue; }
    const start = index;
    if (/^\s*[*-]\s+/.test(lines[index])) {
      let depth = (lines[index].match(/{/g) || []).length - (lines[index].match(/}/g) || []).length;
      while (depth > 0 && ++index < lines.length) depth += (lines[index].match(/{/g) || []).length - (lines[index].match(/}/g) || []).length;
      const end = Math.min(lines.length, index + 1);
      const raw = lines.slice(start, end).join("\n");
      const title = lines[start].trim().replace(/^[*-]\s*/, "").replace(/\s*{\s*$/, "");
      const body = lines.slice(start + 1, end - (depth === 0 && /^\s*}\s*$/.test(lines[end - 1] || "") ? 1 : 0)).join("\n");
      nodes.push({ id: `choice-${offset + start}`, kind: "choice", start: offset + start, end: offset + end, text: raw, title, body });
      index = end;
      continue;
    }
    if (isSpeaker(lines[index])) {
      index++;
      const commands: string[] = [];
      while (index < lines.length && /^\s*\[[^\]]+\]\s*$/.test(lines[index])) commands.push(lines[index++].trim());
      const dialogueStart = index;
      while (index < lines.length && isDialogue(lines[index])) index++;
      const end = index;
      nodes.push({ id: `dialogue-${offset + start}`, kind: "dialogue", start: offset + start, end: offset + end, text: lines.slice(start, end).join("\n"), speaker: lines[start].trim(), dialogue: lines.slice(dialogueStart, end).map(line => line.trim()).join("\n").trimEnd(), commands });
      continue;
    }
    if (isDirective(lines[index])) {
      nodes.push({ id: `directive-${offset + start}`, kind: "directive", start: offset + start, end: offset + start + 1, text: lines[index] });
      index++;
      continue;
    }
    while (index < lines.length && !/^\s*[*-]\s+/.test(lines[index]) && !isSpeaker(lines[index]) && !isDirective(lines[index])) index++;
    nodes.push({ id: `narration-${offset + start}`, kind: "narration", start: offset + start, end: offset + index, text: lines.slice(start, index).join("\n").replace(/^\s*;/gm, "") });
  }
  return nodes;
}

function environment(text: string) {
  const stage = text.match(/^\s*@stage\s+(\S+)/im)?.[1] || "Intro_Hospital";
  const scene = text.match(/^\s*@scene\s+(\S+)/im)?.[1] || stageScenes[stage]?.[0] || "Scene";
  const duration = text.match(/^\s*\[Delay\s+([\d.]+)s\]/im)?.[1] || "0";
  return { stage, scene, duration };
}

function replaceLines(text: string, start: number, end: number, replacement: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  lines.splice(start, end - start, ...replacement.split("\n"));
  return lines.join("\n");
}

function updateDirective(text: string, directive: "stage" | "scene", value: string) {
  const pattern = new RegExp(`^\\s*@${directive}\\s+.*$`, "im");
  if (pattern.test(text)) return text.replace(pattern, `@${directive} ${value}`);
  return `@${directive} ${value}\n${text}`;
}

const icon = (kind: FlowNode["kind"]) => kind === "dialogue" ? "◯" : kind === "choice" ? "⌘" : kind === "directive" ? "⚑" : "▣";
const label = (kind: FlowNode["kind"]) => kind === "dialogue" ? "Dialogue" : kind === "choice" ? "Player choices" : kind === "directive" ? "Direction" : "Narration";

export function FlowEditor({ story, passage, onSelectPassage, onChangePassage, onPreview, onSave, onSaveAs, onChangeView }: {
  story: Story;
  passage: Passage;
  onSelectPassage(id: string): void;
  onChangePassage(passage: Passage): void;
  onPreview(): void;
  onSave(): void;
  onSaveAs(): void;
  onChangeView(view: "text" | "blueprint"): void;
}) {
  const nodes = useMemo(() => parseFlow(passage.text), [passage.text]);
  const choices = nodes.filter(node => node.kind === "choice");
  const [selectedId, setSelectedId] = useState<string>();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [branchCollapsed, setBranchCollapsed] = useState(false);
  const selected = nodes.find(node => node.id === selectedId) || choices[0] || nodes[0];
  const env = environment(passage.text);
  const selectedChoice = selected?.kind === "choice" ? selected : undefined;
  const branchNodes = useMemo(() => selectedChoice?.body ? parseFlow(selectedChoice.body, selectedChoice.start + 1) : [], [selectedChoice]);
  const effect = selectedChoice?.body?.match(/\[([A-Za-z_]\w*)\s*([+-])\s*(\d+)\]/)?.slice(1).join(" ");
  const condition = selectedChoice?.body?.match(/\[([A-Za-z_]\w*\s*(?:>=|<=|>|<|==|!=)\s*[^\]]+)\]/)?.[1];
  const destination = selectedChoice?.body?.match(/\[\[([^\]]+)\]\]/)?.[1];

  const publish = (text: string) => onChangePassage({ ...passage, text });
  const updateNode = (node: FlowNode, raw: string) => publish(replaceLines(passage.text, node.start, node.end, raw));
  const addAfter = (node?: FlowNode) => {
    const at = node?.end ?? passage.text.split("\n").length;
    publish(replaceLines(passage.text, at, at, "\n;New narration"));
  };
  const updateBranchBody = (body: string) => {
    if (!selectedChoice) return;
    updateNode(selectedChoice, `* ${selectedChoice.title}{\n${body}\n}`);
  };

  return <section className={`flow-editor${inspectorOpen ? "" : " inspector-closed"}`}>
    <header className="flow-topbar">
      <div className="flow-brand"><span>✎</span><div><strong>Story Editor</strong><select value={passage.pid} onChange={event => onSelectPassage(event.target.value)}>{story.passages.map(item => <option value={item.pid} key={item.pid}>{item.name}</option>)}</select></div></div>
      <div className="flow-environment">
        <label><span>Stage</span><select value={env.stage} onChange={event => publish(updateDirective(passage.text, "stage", event.target.value))}>{Object.keys(stageScenes).map(stage => <option key={stage}>{stage}</option>)}</select></label>
        <label><span>Scene</span><select value={env.scene} onChange={event => publish(updateDirective(passage.text, "scene", event.target.value))}>{(stageScenes[env.stage] || [env.scene]).map(scene => <option key={scene}>{scene}</option>)}</select></label>
        <label className="flow-duration"><span>◷</span><input aria-label="Scene duration" value={env.duration} readOnly/>s</label>
      </div>
      <div className="flow-actions"><button onClick={onPreview}>▶ Preview</button><button onClick={onSaveAs}>⇧ Export</button><button className="primary" onClick={onSave}>▣ Save</button></div>
    </header>
    <nav className="flow-rail" aria-label="Editor views">
      <button className="active" title="Flow editor">⌘</button>
      <button title="Classic text editor" onClick={() => onChangeView("text")}>◯</button>
      <button title="Blueprint" onClick={() => onChangeView("blueprint")}>▦</button>
      <span/>
      <button title="Help">?</button>
    </nav>
    <main className="flow-canvas">
      <div className="flow-stack">
        {nodes.filter(node => node.kind !== "directive").map((node, index) => node.kind === "choice" ? null : <div className="flow-node-wrap" key={node.id}>
          <article className={`flow-card ${node.kind}${selected?.id === node.id ? " selected" : ""}`} onClick={() => { setSelectedId(node.id); setInspectorOpen(true); }}>
            <div className="flow-card-label"><span>{icon(node.kind)}</span>{label(node.kind)}<button aria-label="More options">•••</button></div>
            {node.kind === "dialogue" ? <div className="flow-dialogue"><input aria-label="Speaker" value={node.speaker} onChange={event => updateNode(node, `                        ${event.target.value}\n${node.commands?.map(line => `            ${line}`).join("\n")}${node.commands?.length ? "\n" : ""}${(node.dialogue || "").split("\n").map(line => `            ${line}`).join("\n")}`)}/><textarea aria-label="Dialogue" value={node.dialogue} rows={Math.max(1, (node.dialogue || "").split("\n").length)} onChange={event => updateNode(node, `                        ${node.speaker}\n${node.commands?.map(line => `            ${line}`).join("\n")}${node.commands?.length ? "\n" : ""}${event.target.value.split("\n").map(line => `            ${line}`).join("\n")}`)}/></div> : <textarea aria-label="Narration" value={node.text} rows={Math.max(2, node.text.split("\n").length)} onChange={event => updateNode(node, event.target.value.split("\n").map(line => line.startsWith(";") ? line : `;${line}`).join("\n"))}/>} 
          </article>
          <button className="flow-add" title="Add after" onClick={() => addAfter(node)}>+</button>
          {index === nodes.length - 1 && <span/>}
        </div>)}

        {!!choices.length && <article className={`flow-choice-list${selectedChoice ? " selected" : ""}`}>
          <div className="flow-card-label"><span>⌘</span>Player choices</div>
          {choices.map(choice => <button className={selected?.id === choice.id ? "active" : ""} key={choice.id} onClick={() => { setSelectedId(choice.id); setInspectorOpen(true); setBranchCollapsed(false); }}><i>⠿</i><span>{choice.title}</span><small>{choice.body ? `${parseFlow(choice.body).length || 1} node${parseFlow(choice.body).length === 1 ? "" : "s"}` : "No branch"}</small><b>{selected?.id === choice.id ? "Open" : "•••"}</b></button>)}
        </article>}

        {selectedChoice && <section className="flow-branch">
          <header><div><small>⌘ Selected branch</small><h2>{selectedChoice.title}</h2></div><span>{effect || "No effect"}</span><span>· {branchNodes.length || 1} nodes</span>{destination && <span>· Ends at {destination}</span>}<button onClick={() => setBranchCollapsed(value => !value)}>{branchCollapsed ? "⌄ Expand" : "⌃ Collapse"}</button></header>
          {!branchCollapsed && <div className="flow-branch-nodes">
            {branchNodes.filter(node => node.kind !== "directive").map(node => <article className={`flow-card compact ${node.kind}`} key={node.id}>
              <div className="flow-card-label"><span>{icon(node.kind)}</span>{label(node.kind)}</div>
              {node.kind === "dialogue" ? <div className="flow-dialogue"><strong>{node.speaker}</strong><p>{node.dialogue}</p></div> : node.kind === "choice" ? <p>{node.title}</p> : <p>{node.text}</p>}
            </article>)}
            {destination && <article className="flow-jump"><small>⚑ Jump / End</small><strong>{destination}</strong><span>Return to main flow</span></article>}
          </div>}
        </section>}
      </div>
    </main>
    {inspectorOpen && <aside className="flow-inspector">
      <h2>Inspector <button aria-label="Close inspector" onClick={() => setInspectorOpen(false)}>×</button></h2>
      {selected ? <>
        <label>Node type <div className="flow-readonly">{icon(selected.kind)} {selected.kind === "choice" ? "Choice Branch" : label(selected.kind)}</div></label>
        {selected.kind === "choice" && <>
          <label>Parent <div className="flow-readonly">Player Choice</div></label>
          <label>Branch title <input value={selected.title} onChange={event => updateNode(selected, `* ${event.target.value}${selected.body ? `{\n${selected.body}\n}` : ""}`)}/></label>
          <label>Effect on select <input className="effect" placeholder="Trust - 100" value={effect || ""} onChange={event => { const rest = (selected.body || "").replace(/^\s*\[[A-Za-z_]\w*\s*[+-]\s*\d+\]\s*\n?/m, ""); updateBranchBody(`${event.target.value ? `[${event.target.value.replace(/\s+/g, " ")}]\n` : ""}${rest}`); }}/></label>
          <label>Contains <div className="flow-readonly multiline">▣ {branchNodes.length || 1} nodes<br/>{destination ? `⚑ Ends at: ${destination}` : "○ No ending passage"}</div></label>
          <label>Condition <input placeholder="e.g., Trust < 60" value={condition || ""} onChange={event => { const body = (selected.body || "").replace(/^\s*\[[A-Za-z_]\w*\s*(?:>=|<=|>|<|==|!=)\s*[^\]]+\]\s*\n?/m, ""); updateBranchBody(`${event.target.value ? `[${event.target.value}]\n` : ""}${body}`); }}/></label>
        </>}
        <label>Tags <input value={passage.tags} placeholder="Add tags" onChange={event => onChangePassage({ ...passage, tags: event.target.value })}/></label>
        <label>Notes <textarea rows={4} placeholder="Notes for this story beat…"/></label>
        <label>ID <div className="flow-readonly muted">node_{passage.pid}_{selected.start}</div></label>
      </> : <p className="flow-inspector-empty">Select a card to inspect it.</p>}
    </aside>}
  </section>;
}
