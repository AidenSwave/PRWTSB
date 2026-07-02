import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Passage } from "../core/types";

const modeNames = ["Action", "Character", "Dialogue"] as const;
const screenplayIndents = ["", "                        ", "            "] as const;
const stageScenes: Record<string, string[]> = {
  Debug: ["UI"],
  Intro: ["LogoScreen", "Ship_Earth", "Ship_IDLE", "Ship_Jump"],
  Intro_Hospital: ["BedBound", "BedBound_Door", "StandCorner"],
};
type TypingMode = 0 | 1 | 2;

function DialogueTextEditor({ value, label, onCommit, onShortcut }: { value: string; label: string; onCommit(value: string): void; onShortcut(kind: "dialogue" | "option", value: string): void }) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const skipBlurCommit = useRef(false);
  useEffect(() => setDraft(value), [value]);
  useLayoutEffect(() => {
    if (!field.current) return;
    field.current.style.height = "auto";
    field.current.style.height = `${field.current.scrollHeight}px`;
  }, [draft]);
  const hasStatic=/\{static\}[\s\S]*?\{\/static\}/i.test(draft);
  const preview=hasStatic?draft.split(/(\{static\}[\s\S]*?\{\/static\})/gi).map((part,index)=>{const match=part.match(/^\{static\}([\s\S]*?)\{\/static\}$/i);return match?<span className="dialogue-static" key={index}>{match[1]}</span>:<span key={index}>{part}</span>}):null;
  return <div className={`dialogue-text-shell${hasStatic?" has-static":""}`}>
  {hasStatic&&!editing&&<div className="conditional-dialogue-text static-preview" role="button" tabIndex={0} onClick={()=>setEditing(true)} onKeyDown={event=>{if(event.key==="Enter")setEditing(true)}}>{preview}</div>}
  <textarea
    ref={field}
    className={`conditional-dialogue-text${hasStatic&&!editing?" static-source-hidden":""}`}
    aria-label={label}
    value={draft}
    rows={Math.max(1, draft.split("\n").length)}
    onFocus={()=>setEditing(true)}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      if (skipBlurCommit.current) { skipBlurCommit.current = false; return; }
      if (draft !== value) onCommit(draft);
      setEditing(false);
    }}
    onKeyDown={event => {
      if (!event.ctrlKey || !["d", "o"].includes(event.key.toLowerCase())) return;
      event.preventDefault();
      skipBlurCommit.current = true;
      onShortcut(event.key.toLowerCase() === "d" ? "dialogue" : "option", draft);
    }}
  /></div>;
}

function modeForLine(line: string): TypingMode {
  const spaces = line.match(/^ */)?.[0].length || 0;
  if (spaces >= 18) return 1;
  if (spaces >= 6) return 2;
  return 0;
}

function modeAt(text: string, caret: number): TypingMode {
  const start = text.lastIndexOf("\n", caret - 1) + 1;
  const endIndex = text.indexOf("\n", caret);
  const end = endIndex === -1 ? text.length : endIndex;
  const line = text.slice(start, end);
  if (line.trim()) return modeForLine(line);

  const previousEnd = Math.max(0, start - 1);
  const previousStart = text.lastIndexOf("\n", previousEnd - 1) + 1;
  return modeForLine(text.slice(previousStart, previousEnd));
}

function formattedLine(line: string, index: number) {
  const choice = line.match(/^(\s*)\*\s+(.+?)\s*$/);
  if (!choice) return <span className="screenplay-line" key={index}>{line || "\u00a0"}{"\n"}</span>;

  const label = choice[2].replace(/[.!?]\s*$/, "");
  return <span className="screenplay-line screenplay-choice-line" key={index}>
    {choice[1]}<span className="screenplay-choice">{label}</span>{"\n"}
  </span>;
}

export function PassageEditor({ passage, onChange, onClose, onOpenPassage }: {
  passage: Passage;
  onChange(passage: Passage): void;
  onClose(): void;
  onOpenPassage(name:string):void;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const formatted = useRef<HTMLDivElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const activeOffset = useRef(0);
  const activeBounds = useRef<{start:number;end:number}|null>(null);
  const changingMode = useRef(false);
  const [text, setText] = useState(passage.text);
  const [mode, setMode] = useState<TypingMode>(() => modeAt(passage.text, 0));
  const [expandedChoices, setExpandedChoices] = useState<Set<number>>(() => new Set());
  const [variableMenu, setVariableMenu] = useState<number>();
  const [conditionMenu, setConditionMenu] = useState<number>();
  const [optionMenu, setOptionMenu] = useState<{ start: number; end: number; bodyEnd: number; hasBody: boolean; x: number; y: number }>();
  const [dialogueMenu, setDialogueMenu] = useState<{ start: number; end: number; x: number; y: number }>();
  const [sceneSettings, setSceneSettings] = useState<number>();
  const [codeMenu, setCodeMenu] = useState<{ line: number; x: number; y: number }>();
  const [expandedCode, setExpandedCode] = useState<Set<number>>(() => new Set());
  const [sceneMenu, setSceneMenu] = useState<{ line: number; x: number; y: number }>();
  const [addPalette, setAddPalette] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [selectedDirectives, setSelectedDirectives] = useState<Set<string>>(() => new Set());
  const [remoteAssets,setRemoteAssets]=useState<string[]>([]);
  const [sourceMode,setSourceMode]=useState(false);
  const refreshAssets=async()=>{try{const response=await fetch("https://api.github.com/repos/AidenSwave/PRWTSB/git/trees/main?recursive=1",{cache:"no-store"});if(!response.ok)return;const data=await response.json() as {tree?:{path:string;type:string}[]};setRemoteAssets((data.tree||[]).filter(item=>item.type==="blob"&&/^assets\//i.test(item.path)).map(item=>item.path))}catch{/* leave current choices visible while offline */}};

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const removeSelected = (event: KeyboardEvent) => {
      if (!selectedDirectives.size || event.key !== "Backspace" || (!event.metaKey && !event.ctrlKey)) return;
      const target = event.target as HTMLElement;
      const selectedControl=target.closest?.(".selected-directive");
      if ((/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) && !selectedControl) return;
      event.preventDefault();
      const source = text.split("\n");
      [...selectedDirectives].map(key => key.split(":").map(Number) as [number, number]).sort((a,b) => b[0] - a[0]).forEach(([start,end]) => source.splice(start, end - start));
      publish(source.join("\n"));
      setSelectedDirectives(new Set());
    };
    window.addEventListener("keydown", removeSelected);
    return () => window.removeEventListener("keydown", removeSelected);
  }, [selectedDirectives, text]);

  useEffect(() => {
    if (!optionMenu && !dialogueMenu && !codeMenu && !sceneMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.(".editor-context-menu")) { setOptionMenu(undefined); setDialogueMenu(undefined); setCodeMenu(undefined); setSceneMenu(undefined); }
    };
    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [optionMenu, dialogueMenu, codeMenu, sceneMenu]);

  useEffect(() => {
    const openAdd = (event: KeyboardEvent) => {
      if(event.shiftKey&&event.key==="Tab"){event.preventDefault();setSourceMode(value=>!value);return}
      if (!event.shiftKey || event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      setAddSearch("");
      setAddPalette(true);
    };
    window.addEventListener("keydown", openAdd);
    return () => window.removeEventListener("keydown", openAdd);
  }, []);

  const publish = (nextText: string) => {
    setText(nextText);
    onChange({ ...passage, text: nextText });
  };

  const applyMode = (nextMode: TypingMode) => {
    const textarea = editor.current;
    if (!textarea) return;
    const { start, end } = selection.current;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEndIndex = text.indexOf("\n", start);
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    const line = text.slice(lineStart, lineEnd);
    const oldIndent = line.match(/^ */)?.[0] || "";
    const newIndent = screenplayIndents[nextMode];
    const nextText = text.slice(0, lineStart) + newIndent + line.slice(oldIndent.length) + text.slice(lineEnd);
    const offset = newIndent.length - oldIndent.length;

    changingMode.current = true;
    setMode(nextMode);
    publish(nextText);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(
        Math.max(0, Math.max(lineStart + newIndent.length, start + offset) - activeOffset.current),
        Math.max(0, Math.max(lineStart + newIndent.length, end + offset) - activeOffset.current),
      );
      selection.current = {
        start: Math.max(lineStart + newIndent.length, start + offset),
        end: Math.max(lineStart + newIndent.length, end + offset),
      };
      requestAnimationFrame(() => { changingMode.current = false; });
    });
  };

  const readCurrentMode = () => {
    if (!editor.current || changingMode.current) return;
    selection.current = {
      start: activeOffset.current + editor.current.selectionStart,
      end: activeOffset.current + editor.current.selectionEnd,
    };
    setMode(modeAt(text, selection.current.start));
  };

  const updateVariable = (lineIndex: number, name: string, sign: "+" | "-", amount: string) => {
    const lines = text.split("\n");
    const indent = lines[lineIndex].match(/^\s*/)?.[0] || "";
    lines[lineIndex] = `${indent}[${name || "Variable"} ${sign} ${Math.max(0, Number(amount) || 0)}]`;
    publish(lines.join("\n"));
  };

  const updateChoiceLabel = (lineIndex: number, label: string) => {
    const lines = text.split("\n");
    const match = lines[lineIndex].match(/^(\s*)([*-])\s*(.*?)(\s*{\s*)?$/);
    if (!match) return;
    lines[lineIndex] = `${match[1]}${match[2]} ${label}${match[4] ? "{" : ""}`;
    publish(lines.join("\n"));
  };

  const updateChoiceBody = (start: number, bodyEnd: number, body: string) => {
    const lines = text.split("\n");
    lines.splice(start + 1, bodyEnd - start - 1, ...body.split("\n"));
    publish(lines.join("\n"));
  };

  const updateTextSection = (start: number, end: number, value: string) => {
    const lines = text.split("\n");
    lines.splice(start, end - start, ...value.split("\n"));
    publish(lines.join("\n"));
  };

  const updateIndentedLine = (lineIndex: number, value: string) => {
    const lines = text.split("\n");
    const indent = lines[lineIndex].match(/^\s*/)?.[0] || "";
    lines[lineIndex] = indent + value;
    publish(lines.join("\n"));
  };

  const addCondition = (speakerLine: number) => {
    const lines = text.split("\n");
    const indent = lines[speakerLine].match(/^\s*/)?.[0] || "";
    lines.splice(speakerLine + 1, 0, `${indent}\t[Condition > 0]`);
    publish(lines.join("\n"));
    setConditionMenu(speakerLine);
  };

  const removeCondition = (speakerLine: number) => {
    const lines = text.split("\n");
    if (/^\s*\[[A-Za-z_]\w*\s*(?:>=|<=|>|<|==|!=)\s*[^\]]+\]\s*$/.test(lines[speakerLine + 1] || "")) {
      lines.splice(speakerLine + 1, 1);
      publish(lines.join("\n"));
    }
    setConditionMenu(undefined);
  };

  const insertAtCursor = (kind: "dialogue" | "option") => {
    const textarea = editor.current;
    const point = textarea ? activeOffset.current + textarea.selectionStart : text.length;
    const before = text.slice(0, point), after = text.slice(point);
    const block = kind === "dialogue"
      ? "                        Character\n            Dialogue"
      : "* New option";
    const next = `${before}${before && !before.endsWith("\n") ? "\n" : ""}${block}${after && !after.startsWith("\n") ? "\n" : ""}${after}`;
    publish(next);
  };

  const insertRawAtCursor = (block: string) => {
    const textarea = editor.current;
    let point = textarea ? activeOffset.current + textarea.selectionStart : text.length;
    if(activeBounds.current)point=Math.max(activeBounds.current.start,Math.min(point,activeBounds.current.end));
    const before = text.slice(0, point), after = text.slice(point);
    publish(`${before}${before && !before.endsWith("\n") ? "\n" : ""}${block}${after && !after.startsWith("\n") ? "\n" : ""}${after}`);
    setAddPalette(false);
    requestAnimationFrame(()=>editor.current?.focus());
  };

  const addOptionFeature = (kind: "variable" | "passage" | "socket") => {
    if (!optionMenu) return;
    const lines = text.split("\n");
    const content = kind === "variable" ? "\t[Variable + 10]" : kind === "socket" ? "\t/Socket Continue" : "\tContinue: [[New Passage]]";
    if (optionMenu.hasBody) lines.splice(optionMenu.bodyEnd, 0, content);
    else {
      lines[optionMenu.start] = `${lines[optionMenu.start].trimEnd()}{`;
      lines.splice(optionMenu.start + 1, 0, content, "}");
    }
    publish(lines.join("\n"));
    if (kind !== "variable") setExpandedChoices(current => new Set(current).add(optionMenu.start));
    setOptionMenu(undefined);
  };

  const deleteLines = (start: number, end: number) => {
    const lines = text.split("\n");
    lines.splice(start, end - start);
    if (start < lines.length && !lines[start].trim() && start > 0 && !lines[start - 1].trim()) lines.splice(start, 1);
    publish(lines.join("\n"));
    setOptionMenu(undefined);
    setDialogueMenu(undefined);
  };

  const attachCode = () => {
    if (!codeMenu) return;
    const lines = text.split("\n");
    lines.splice(codeMenu.line + 1, 0, "<!-- @editor-code -->", "", "<!-- /@editor-code -->");
    publish(lines.join("\n"));
    setCodeMenu(undefined);
  };

  const formattedScreenplay = () => {
    const lines = text.split("\n");
    const result: React.ReactNode[] = [];
    const stageLine = lines.findIndex(line => /^\s*@stage\s+/i.test(line));
    const firstSceneLine = lines.findIndex(line => /^\s*@scene\s+/i.test(line));
    const stageMatch = stageLine >= 0 ? lines[stageLine].match(/^\s*@stage\s+(\S+)/i) : null;
    const sceneMatch = firstSceneLine >= 0 ? lines[firstSceneLine].match(/^\s*@scene\s+(\S+)(?:\s+\[Start Black\])?/i) : null;
    const activeStage = stageMatch?.[1] || Object.keys(stageScenes)[0];
    const activeScene = sceneMatch?.[1] || stageScenes[activeStage][0];
    const remoteStages=[...new Set(remoteAssets.map(path=>path.split("/")[1]).filter(Boolean))].sort();
    const availableStages=[...new Set([...Object.keys(stageScenes),...remoteStages])];
    const updateStage = (stage: string) => {
      const source = text.split("\n");
      if (stageLine >= 0) source[stageLine] = `@stage ${stage}`;
      else source.unshift(`@stage ${stage}`);
      const sceneIndex = stageLine < 0 && firstSceneLine >= 0 ? firstSceneLine + 1 : firstSceneLine;
      const scenes=stageScenes[stage]||[];if (sceneIndex >= 0 && scenes.length&&!scenes.includes(activeScene)) source[sceneIndex] = `@scene ${scenes[0]}${/\[Start Black\]/i.test(source[sceneIndex]) ? " [Start Black]" : ""}`;
      publish(source.join("\n"));
    };
    const updateScene = (lineIndex: number, scene: string, startBlack: boolean) => {
      const source = text.split("\n");
      if (lineIndex >= 0) source[lineIndex] = `@scene ${scene}${startBlack ? " [Start Black]" : ""}`;
      else source.splice(stageLine >= 0 ? stageLine + 1 : 0, 0, `@scene ${scene}${startBlack ? " [Start Black]" : ""}`);
      publish(source.join("\n"));
    };
    const delayAt = (lineIndex: number) => lines[lineIndex]?.match(/^\s*\[Delay\s+(\d+(?:\.\d+)?)\s*(ms|s)?\]\s*$/i) || null;
    const mediaAt = (lineIndex: number) => lines[lineIndex]?.match(/^\s*@(audio|sequence|video)\s+(\S+)(.*)$/i) || null;
    const sceneDelayInfo = (lineIndex: number) => {
      let delayLine = lineIndex + 1;
      while (delayLine < lines.length && !lines[delayLine].trim()) delayLine++;
      const delay = delayAt(delayLine);
      return delay ? { delay, delayLine } : null;
    };
    const selectDirective = (start: number, end: number, additive: boolean) => setSelectedDirectives(current => {
      const key = `${start}:${end}`;
      const next = additive ? new Set(current) : new Set<string>();
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    const socketAt = (lineIndex: number) => {
      const legacy = lines[lineIndex]?.match(/^\s*Continue\s*:\s*\[\[([^\]]*)\]\]\s*$/i);
      const socket = lines[lineIndex]?.match(/^\s*\/Socket(?:\s+([^\-]+?))?(?:\s*->\s*\[\[([^\]]+)\]\])?\s*$/i);
      return legacy ? { label: "Continue", target: legacy[1].trim() || undefined } : socket ? { label: socket[1]?.trim() || "Continue", target: socket[2]?.trim() } : null;
    };
    const updateDelay = (lineIndex: number, value: string, unit = "s") => {
      const source = text.split("\n");
      source[lineIndex] = `[Delay ${Math.max(0, Number(value) || 0)}${unit}]`;
      publish(source.join("\n"));
    };
    const addSceneDuration = (lineIndex: number) => {
      const source = text.split("\n");
      source.splice(lineIndex + 1, 0, "[Delay 1s]");
      publish(source.join("\n"));
      setSceneMenu(undefined);
    };
    const sceneControl = (lineIndex: number, compact = false) => {
      const match = lineIndex >= 0 ? lines[lineIndex].match(/^\s*@scene\s+(\S+)(?:\s+\[Start Black\])?/i) : null;
      const fallbackScenes=stageScenes[activeStage]||[],remoteScenes=[...new Set(remoteAssets.filter(path=>path.split("/")[1]===activeStage&&/\/Scenes\//i.test(path)).map(path=>path.split("/").pop()!.replace(/\.[^.]+$/,"")))].sort(),availableScenes=[...new Set([...fallbackScenes,...remoteScenes])];
      const scene = match?.[1] || availableScenes[0] || "Scene";
      const startBlack = lineIndex >= 0 && /\[Start Black\]/i.test(lines[lineIndex]);
      const delayInfo = lineIndex >= 0 ? sceneDelayInfo(lineIndex) : null;
      const delay = delayInfo?.delay || null;
      const selectionEnd = delayInfo ? delayInfo.delayLine + 1 : lineIndex + 1;
      const selected = selectedDirectives.has(`${lineIndex}:${selectionEnd}`);
      return <div className={`scene-control${compact ? " compact" : ""}${selected ? " selected-directive" : ""}`} key={`scene-${lineIndex}`} tabIndex={0} draggable onClick={event => { if (!(event.target as HTMLElement).closest("select,input,button,label")) selectDirective(lineIndex, selectionEnd, event.shiftKey); }} onDragStart={event => { selectDirective(lineIndex, selectionEnd, event.shiftKey); event.dataTransfer.setData("text/plain", `@scene ${scene}${startBlack ? " [Start Black]" : ""}${delay ? `\n[Delay ${delay[1]}${delay[2] || "s"}]` : ""}`);event.dataTransfer.setData("application/x-script-editor-lines",JSON.stringify({start:lineIndex,end:selectionEnd})); }} onContextMenu={event => { event.preventDefault(); setSceneMenu({ line: lineIndex, x: event.clientX, y: event.clientY }); }}>
        <span>Scene</span>
        <select value={scene} onMouseDown={()=>void refreshAssets()} onChange={event => updateScene(lineIndex, event.target.value, startBlack)}>{availableScenes.map(name => <option key={name}>{name}</option>)}</select>
        {delayInfo && <label className="scene-duration"><span>🕒</span><input aria-label="Scene duration" type="number" min="0" step="0.1" value={delayInfo.delay[1]} onChange={event => updateDelay(delayInfo.delayLine, event.target.value, delayInfo.delay[2] || "s")}/><small>{delayInfo.delay[2] || "s"}</small></label>}
        <button type="button" className={`scene-settings${startBlack ? " active" : ""}`} title="Scene settings" onClick={() => setSceneSettings(sceneSettings === lineIndex ? undefined : lineIndex)}>⚙</button>
        {sceneSettings === lineIndex && <div className="scene-settings-popover"><label><input type="checkbox" checked={startBlack} onChange={event => updateScene(lineIndex, scene, event.target.checked)}/> Start black</label></div>}
      </div>;
    };
    const delayControl = (lineIndex: number) => {
      const delay = delayAt(lineIndex)!;
      const selected = selectedDirectives.has(`${lineIndex}:${lineIndex + 1}`);
      return <label className={`delay-control${selected ? " selected-directive" : ""}`} key={`delay-${lineIndex}`} tabIndex={0} draggable onClick={event => selectDirective(lineIndex, lineIndex + 1, event.shiftKey)} onDragStart={event => { selectDirective(lineIndex, lineIndex + 1, event.shiftKey); event.dataTransfer.setData("text/plain", `[Delay ${delay[1]}${delay[2] || "s"}]`);event.dataTransfer.setData("application/x-script-editor-lines",JSON.stringify({start:lineIndex,end:lineIndex+1})); }}><span>🕒</span><input aria-label="Delay" type="number" min="0" step="0.1" value={delay[1]} onChange={event => updateDelay(lineIndex, event.target.value, delay[2] || "s")}/><small>{delay[2] || "s"}</small></label>;
    };
    const mediaControl = (lineIndex: number) => {
      const match=mediaAt(lineIndex)! as RegExpMatchArray;
      const kind=match[1].toLowerCase(),selected=selectedDirectives.has(`${lineIndex}:${lineIndex+1}`);
      const update=(name:string,modifiers:string)=>{const source=text.split("\n");source[lineIndex]=`@${kind} ${name||"Asset"}${modifiers.trim()?` ${modifiers.trim()}`:""}`;publish(source.join("\n"))};
      const assets=[...new Set(remoteAssets.filter(path=>path.split("/").includes(activeStage)).filter(path=>kind!=="audio"||/\.(?:mp3|wav|ogg|m4a|flac)$/i.test(path)).map(path=>path.split("/").pop()!.replace(/\.[^.]+$/,"")))].sort(),listId=`${kind}-assets-${lineIndex}`;
      return <label className={`media-control media-${kind}${selected?" selected-directive":""}`} key={`media-${lineIndex}`} tabIndex={0} draggable onClick={event=>selectDirective(lineIndex,lineIndex+1,event.shiftKey)} onDragStart={event=>{selectDirective(lineIndex,lineIndex+1,event.shiftKey);event.dataTransfer.setData("text/plain",lines[lineIndex].trim());event.dataTransfer.setData("application/x-script-editor-lines",JSON.stringify({start:lineIndex,end:lineIndex+1}))}}><span>{kind==="audio"?"♪":kind==="sequence"?"⏭":"▶"}</span><b>{kind}</b><input aria-label={`${kind} asset`} list={listId} value={match[2].toLowerCase()==="asset"?"":match[2]} placeholder="Choose asset…" onMouseDown={()=>void refreshAssets()} onChange={event=>update(event.target.value||"Asset",match[3])}/><datalist id={listId}>{assets.map(asset=><option key={asset} value={asset}/>)}</datalist>{kind!=="audio"&&<input className="media-modifiers" aria-label={`${kind} options`} placeholder="options" value={match[3].trim()} onChange={event=>update(match[2],event.target.value)}/>}</label>;
    };
    const shotControl = (lineIndex: number) => {
      const match = lines[lineIndex].match(/^\s*\[Shot\s*:\s*(Wide|Closeup)\s*\]\s*$/i)!;
      const selected = selectedDirectives.has(`${lineIndex}:${lineIndex + 1}`);
      return <label className={`shot-control${selected ? " selected-directive" : ""}`} key={`shot-${lineIndex}`} tabIndex={0} draggable onClick={event => selectDirective(lineIndex, lineIndex + 1, event.shiftKey)} onDragStart={event => { selectDirective(lineIndex, lineIndex + 1, event.shiftKey); event.dataTransfer.setData("text/plain", lines[lineIndex].trim());event.dataTransfer.setData("application/x-script-editor-lines",JSON.stringify({start:lineIndex,end:lineIndex+1})); }}><span>◫</span><select value={match[1][0].toUpperCase() + match[1].slice(1).toLowerCase()} onChange={event => updateIndentedLine(lineIndex, `[Shot : ${event.target.value}]`)}><option>Wide</option><option>Closeup</option></select></label>;
    };
    const socketControl = (lineIndex: number) => {
      const socket = socketAt(lineIndex)!;
      if(/^\s*Continue\s*:/i.test(lines[lineIndex])){const lastMeaningful=lines.reduce((last,line,index)=>line.trim()?index:last,-1),terminal=lineIndex===lastMeaningful;return <button type="button" className={`continue-passage-button ${terminal?"terminal":"nested"}${socket.target?"":" unbound"}`} key={`continue-${lineIndex}`} disabled={!socket.target} onClick={()=>socket.target&&onOpenPassage(socket.target)} title={socket.target?`Open ${socket.target}`:"Connect this socket in Blueprint"}>{socket.target||"Unbound"}</button>}
      const socketIndex = lines.slice(0, lineIndex).filter((_, index) => socketAt(index)).length;
      const colors = ["#66bfae", "#7399e6", "#a579d1", "#e28b70", "#d1aa45", "#68ad79"];
      return <span className={`script-socket${socket.target?"":" unbound"}`} key={`socket-${lineIndex}`} style={{ "--socket-color": colors[socketIndex % colors.length] } as React.CSSProperties} title={`${socket.label}${socket.target ? ` → ${socket.target}` : " (not linked)"}`}>{socket.target?socket.label:"Unset link"}</span>;
    };
    result.push(<div className="passage-environment" key="environment"><label><span>Stage</span><select value={activeStage} onMouseDown={()=>void refreshAssets()} onChange={event => updateStage(event.target.value)}>{availableStages.map(name => <option key={name}>{name}</option>)}</select></label>{sceneControl(firstSceneLine)}</div>);
    const choiceAt = (start: number) => {
      const match = lines[start]?.match(/^(\s*)([*-])\s*(.*?)(\s*{\s*)?$/);
      if (!match) return null;
      let end = start + 1;
      if (match[4]) {
        let depth = 1;
        while (end < lines.length && depth > 0) {
          depth += (lines[end].match(/{/g) || []).length - (lines[end].match(/}/g) || []).length;
          end++;
        }
      }
      const bodyEnd = match[4] ? Math.max(start + 1, end - 1) : start + 1;
      const meaningful = lines.slice(start + 1, bodyEnd).map((line, offset) => ({ line, index: start + 1 + offset })).filter(item => item.line.trim());
      const variable = meaningful.length === 1 ? meaningful[0].line.match(/^\s*\[([A-Za-z_]\w*)\s*([+-])\s*(\d+(?:\.\d+)?)\]\s*$/) : null;
      return { start, end, bodyEnd, label: match[3].trim().replace(/[.!?]\s*$/, ""), variable, meaningful, hasBody: Boolean(match[4]) };
    };
    const attachedCodeAt = (start: number) => {
      if (!/^\s*;/.test(lines[start] || "") || !/^\s*<!--\s*@editor-code\s*-->\s*$/.test(lines[start + 1] || "")) return null;
      let markerEnd = start + 2;
      while (markerEnd < lines.length && !/^\s*<!--\s*\/@editor-code\s*-->\s*$/.test(lines[markerEnd])) markerEnd++;
      if (markerEnd >= lines.length) return null;
      return { start, end: markerEnd + 1, codeStart: start + 2, markerEnd, action: lines[start].replace(/^\s*;/, ""), code: lines.slice(start + 2, markerEnd).join("\n") };
    };
    const inlineCodeAt = (start: number) => {
      if (!/^\s*\[\.\.\.\]\s*$/.test(lines[start] || "")) return null;
      let codeStart = start + 1;
      while (codeStart < lines.length && !lines[codeStart].trim()) codeStart++;
      let markerEnd = codeStart;
      while (markerEnd < lines.length && !/^\s*\[\.\.\.\]\s*$/.test(lines[markerEnd])) markerEnd++;
      if (markerEnd >= lines.length || markerEnd === codeStart) return null;
      let codeEnd = markerEnd;
      while (codeEnd > codeStart && !lines[codeEnd - 1].trim()) codeEnd--;
      return { start, end: markerEnd + 1, codeStart, codeEnd };
    };
    const dialogueAt = (start: number, limit = lines.length) => {
      const speaker = lines[start]?.trim();
      const condition = lines[start + 1]?.match(/^\s*\[([A-Za-z_]\w*)\s*(>=|<=|>|<|==|!=)\s*([^\]]+)\]\s*$/);
      const plainSpeaker = speaker?.replace(/\[[^\]]+\]\s*$/, "").trim() || "";
      const speakerIndent = (lines[start]?.match(/^\s*/)?.[0] || "").replace(/\t/g, "    ").length;
      const speakerLike = speakerIndent >= 18 && plainSpeaker.length > 0 && plainSpeaker.length < 60 && /^[A-Z][A-Za-z0-9_' -]*$/.test(plainSpeaker);
      if (!speakerLike || /^[@;*\[]/.test(speaker || "")) return null;
      const dialogueStart = start + (condition ? 2 : 1);
      let end = dialogueStart;
      while (end < limit && lines[end].trim()) {
        const embedded = inlineCodeAt(end);
        if (embedded && embedded.end <= limit) { end = embedded.end; continue; }
        end++;
      }
      if (end === dialogueStart) return null;
      return { start, end, speaker, condition, dialogueStart, dialogue: lines.slice(dialogueStart, end).map(line => line.trim()).join("\n") };
    };
    const renderChoice = (choice: NonNullable<ReturnType<typeof choiceAt>>) => {
      const { start, bodyEnd, label, variable, meaningful, hasBody } = choice;
      const scene = hasBody && !variable;
      const expanded = expandedChoices.has(start);
      return <span className={`choice-entry${scene ? " scene-entry" : ""}`} key={start} onContextMenu={event => { if ((event.target as HTMLElement).matches("input,textarea,[contenteditable=true]")) return; event.preventDefault(); event.stopPropagation(); setOptionMenu({ start, end: choice.end, bodyEnd, hasBody, x: event.clientX, y: event.clientY }); }}>
        <span className="screenplay-choice-line"><span className="choice-shell">
          <input className={`screenplay-choice${scene ? " has-scene" : ""}`} aria-label="Option name" value={label} size={Math.max(4, label.length)} onPointerDown={event => event.stopPropagation()} onChange={event => updateChoiceLabel(start, event.target.value)}/>
          <button type="button" className="choice-tool option-menu-trigger" title="Option actions" aria-label="Option actions" onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();const box=event.currentTarget.getBoundingClientRect();setOptionMenu({start,end:choice.end,bodyEnd,hasBody,x:box.left,y:box.bottom+3})}}>•••</button>
          {variable && <button type="button" className="choice-tool variable-tool" title="Edit variable adjustment" aria-label={`Edit ${variable[1]} adjustment`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setVariableMenu(variableMenu === start ? undefined : start); }}>±</button>}
          {scene && <button type="button" className="choice-tool scene-toggle" title={expanded ? "Fold option scene" : "Show option scene"} aria-expanded={expanded} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setExpandedChoices(current => { const next = new Set(current); next.has(start) ? next.delete(start) : next.add(start); return next; }); }}>{expanded ? "⌃" : "⌄"}</button>}
          {variable && variableMenu === start && <span className="variable-popover" onPointerDown={event => event.stopPropagation()}>
            <input aria-label="Variable name" value={variable[1]} onChange={event => updateVariable(meaningful[0].index, event.target.value, variable[2] as "+" | "-", variable[3])}/>
            <select aria-label="Adjustment direction" value={variable[2]} onChange={event => updateVariable(meaningful[0].index, variable[1], event.target.value as "+" | "-", variable[3])}><option value="+">+</option><option value="-">−</option></select>
            <input className="variable-amount" aria-label="Adjustment amount" type="number" min="0" value={variable[3]} onChange={event => updateVariable(meaningful[0].index, variable[1], variable[2] as "+" | "-", event.target.value)}/>
          </span>}
        </span></span>
        {scene && expanded && <span className="choice-scene">{renderDialogueRange(start + 1, bodyEnd, `choice-${start}`)}</span>}
      </span>;
    };
    const renderDialogue = (block: NonNullable<ReturnType<typeof dialogueAt>>, keyPrefix = "dialogue") => {
      const { start, end, speaker, condition, dialogueStart, dialogue } = block;
      const summary = condition ? `${condition[1]} ${condition[2]} ${condition[3].trim()}` : "";
      const direction = condition && /^[<>]/.test(condition[2]) ? (condition[2].startsWith(">") ? "positive" : "negative") : "neutral";
      return <section className={`conditional-dialogue${condition ? ` has-condition condition-${direction}` : ""}`} key={`${keyPrefix}-${start}`} onContextMenu={event => { if ((event.target as HTMLElement).matches("input,textarea,[contenteditable=true]")) return; event.preventDefault(); event.stopPropagation(); setDialogueMenu({ start, end, x: event.clientX, y: event.clientY }); }}>
        <div className="condition-controls">
          {condition && <span className="condition-summary">{summary}</span>}
          <button type="button" className="condition-tool" title={condition ? "Edit dialogue condition" : "Add dialogue condition"} aria-label={condition ? `Edit condition ${summary}` : "Add dialogue condition"} onClick={() => condition ? setConditionMenu(conditionMenu === start ? undefined : start) : addCondition(start)}>◇</button>
          {condition && conditionMenu === start && <div className="condition-popover">
            <input aria-label="Condition variable" value={condition[1]} onChange={event => updateIndentedLine(start + 1, `[${event.target.value || "Variable"} ${condition[2]} ${condition[3].trim()}]`)}/>
            <select aria-label="Condition comparison" value={condition[2]} onChange={event => updateIndentedLine(start + 1, `[${condition[1]} ${event.target.value} ${condition[3].trim()}]`)}>
              <option value=">">&gt;</option><option value=">=">≥</option><option value="<">&lt;</option><option value="<=">≤</option><option value="==">=</option><option value="!=">≠</option>
            </select>
            <input className="condition-value" aria-label="Condition value" value={condition[3].trim()} onChange={event => updateIndentedLine(start + 1, `[${condition[1]} ${condition[2]} ${event.target.value}]`)}/>
            <button type="button" className="condition-remove" aria-label="Remove condition" title="Remove condition" onClick={() => removeCondition(start)}>×</button>
          </div>}
        </div>
        <input className="conditional-speaker" aria-label="Speaker" value={speaker} size={Math.max(4, speaker.length)} onChange={event => updateIndentedLine(start, event.target.value)}/>
        {(() => { const embedded = inlineCodeAt(dialogueStart) || (() => { for (let cursor = dialogueStart; cursor < end; cursor++) { const found = inlineCodeAt(cursor); if (found && found.end <= end) return found; } return null; })(); if (!embedded) return <DialogueTextEditor label={`${speaker} dialogue`} value={dialogue} onCommit={value => {
          const sourceLines = text.split("\n");
          const indent = sourceLines[dialogueStart]?.match(/^\s*/)?.[0] || "";
          sourceLines.splice(dialogueStart, end - dialogueStart, ...value.split("\n").map(line => indent + line));
          publish(sourceLines.join("\n"));
        }} onShortcut={(kind, value) => {
          const sourceLines = text.split("\n");
          const indent = sourceLines[dialogueStart]?.match(/^\s*/)?.[0] || "";
          const edited = value.split("\n").map(line => indent + line);
          sourceLines.splice(dialogueStart, end - dialogueStart, ...edited);
          const insertion = dialogueStart + edited.length;
          const block = kind === "dialogue" ? ["", "                        Character", "            Dialogue"] : ["", "* New option"];
          sourceLines.splice(insertion, 0, ...block);
          publish(sourceLines.join("\n"));
        }}/>; const before=lines.slice(dialogueStart,embedded.start).map(line=>line.trim()).join("\n"),after=lines.slice(embedded.end,end).map(line=>line.trim()).join("\n"); const commitRange=(from:number,to:number,value:string)=>{const sourceLines=text.split("\n"),indent=sourceLines[from]?.match(/^\s*/)?.[0]||"";sourceLines.splice(from,to-from,...value.split("\n").map(line=>indent+line));publish(sourceLines.join("\n"))}; return <div className="dialogue-with-inline-code"><div className="dialogue-before-code"><DialogueTextEditor label={`${speaker} dialogue before code`} value={before} onCommit={value=>commitRange(dialogueStart,embedded.start,value)} onShortcut={()=>{}}/>{renderInlineCode(embedded)}</div>{after&&<DialogueTextEditor label={`${speaker} dialogue after code`} value={after} onCommit={value=>commitRange(embedded.end,end,value)} onShortcut={()=>{}}/>}</div>; })()}
      </section>;
    };
    const renderDialogueRange = (from: number, to: number, keyPrefix: string, bounds?:{start:number;end:number}) => {
      const nodes: React.ReactNode[] = [];
      for (let cursor = from; cursor < to;) {
        const inlineCode = inlineCodeAt(cursor);
        if (inlineCode && inlineCode.end <= to) { nodes.push(renderInlineCode(inlineCode)); cursor = inlineCode.end; continue; }
        if (/^\s*@scene\s+/i.test(lines[cursor])) { const bundled=sceneDelayInfo(cursor);nodes.push(sceneControl(cursor,true));cursor=bundled&&bundled.delayLine<to?bundled.delayLine+1:cursor+1;continue; }
        if (delayAt(cursor)) { nodes.push(delayControl(cursor)); cursor++; continue; }
        if (mediaAt(cursor)) { nodes.push(mediaControl(cursor)); cursor++; continue; }
        if (socketAt(cursor)) { nodes.push(socketControl(cursor)); cursor++; continue; }
        if (/^\s*\[Shot\s*:\s*(?:Wide|Closeup)\s*\]\s*$/i.test(lines[cursor])) { nodes.push(shotControl(cursor));cursor++;continue; }
        const dialogue = dialogueAt(cursor, to);
        if (dialogue) {
          let nextStart = dialogue.end;
          while (nextStart < to && !lines[nextStart].trim()) nextStart++;
          const next = dialogueAt(nextStart, to);
          const firstDirection = dialogue.condition?.[2].startsWith(">") ? "positive" : dialogue.condition?.[2].startsWith("<") ? "negative" : "";
          const nextDirection = next?.condition?.[2].startsWith(">") ? "positive" : next?.condition?.[2].startsWith("<") ? "negative" : "";
          if (next && firstDirection && nextDirection && firstDirection !== nextDirection) {
            nodes.push(<div className="dialogue-pair" key={`${keyPrefix}-pair-${cursor}`}>{renderDialogue(dialogue, keyPrefix)}{renderDialogue(next, keyPrefix)}</div>);
            cursor = next.end;
          } else { nodes.push(renderDialogue(dialogue, keyPrefix)); cursor = dialogue.end; }
          continue;
        }
        const start = cursor;
        while (cursor < to && !dialogueAt(cursor, to) && !inlineCodeAt(cursor) && !delayAt(cursor) && !mediaAt(cursor) && !socketAt(cursor) && !/^\s*@scene\s+/i.test(lines[cursor]) && !/^\s*\[Shot\s*:\s*(?:Wide|Closeup)\s*\]\s*$/i.test(lines[cursor])) cursor++;
        const value=lines.slice(start,cursor).join("\n"),offset=start===0?0:lines.slice(0,start).join("\n").length+1;
        nodes.push(<textarea className="passage-text-section range-text-editor" data-source-start={start} key={`${keyPrefix}-text-${start}`} aria-label="Screenplay text" value={value} rows={Math.max(1,cursor-start)} ref={element=>{if(element===document.activeElement)editor.current=element}} onFocus={event=>{editor.current=event.currentTarget;activeOffset.current=offset;activeBounds.current=bounds?{start:bounds.start===0?0:lines.slice(0,bounds.start).join("\n").length+1,end:lines.slice(0,bounds.end).join("\n").length}:null;readCurrentMode()}} onChange={event=>{editor.current=event.currentTarget;activeOffset.current=offset;selection.current={start:offset+event.target.selectionStart,end:offset+event.target.selectionEnd};updateTextSection(start,cursor,event.target.value)}} onClick={readCurrentMode} onKeyUp={readCurrentMode} onSelect={readCurrentMode}/>);
      }
      return nodes;
    };
    const renderInlineCode = (block: NonNullable<ReturnType<typeof inlineCodeAt>>) => {
      const open = expandedCode.has(block.start);
      return <span className={`inline-code-pocket${open ? " active" : ""}`} key={`inline-code-${block.start}`}>
        <button type="button" className={`code-lightbulb inline${open ? " active" : ""}`} title={open ? "Hide embedded code" : "Show embedded code"} aria-label={open ? "Hide embedded code" : "Show embedded code"} onClick={() => setExpandedCode(current => { const next = new Set(current); next.has(block.start) ? next.delete(block.start) : next.add(block.start); return next; })}>💡</button>
        {open && <span className="inline-code-area">{renderDialogueRange(block.codeStart, block.codeEnd, `inline-${block.start}`)}</span>}
      </span>;
    };
    const renderAttachedCode = (block: NonNullable<ReturnType<typeof attachedCodeAt>>) => {
      const open = expandedCode.has(block.start);
      const dropAt=(event:React.DragEvent,insertion:number)=>{event.preventDefault();event.stopPropagation();const inserted=event.dataTransfer.getData("text/plain");if(!inserted)return;const source=text.split("\n"),moved=event.dataTransfer.getData("application/x-script-editor-lines");let target=insertion,newBlockStart=block.start;if(moved){try{const range=JSON.parse(moved) as {start:number;end:number};if(range.start<block.start||range.start>=block.end){const count=range.end-range.start;source.splice(range.start,count);if(range.start<target)target-=count;if(range.start<block.start)newBlockStart-=count}}catch{/* external copy */}}source.splice(target,0,...inserted.split("\n"));if(newBlockStart!==block.start)setExpandedCode(current=>{const next=new Set(current);if(next.delete(block.start))next.add(newBlockStart);return next});publish(source.join("\n"))};
      return <section className="coded-action" key={`code-${block.start}`}>
        <textarea aria-label="Action text" value={block.action} rows={Math.max(1, block.action.split("\n").length)} onChange={event => updateIndentedLine(block.start, `;${event.target.value}`)}/>
        <button type="button" className={`code-lightbulb${open ? " active" : ""}`} title={open ? "Hide attached code" : "Show attached code"} onClick={() => setExpandedCode(current => { const next = new Set(current); next.has(block.start) ? next.delete(block.start) : next.add(block.start); return next; })}>💡</button>
        {open && <button type="button" className="code-remove" title="Remove attached code" aria-label="Remove attached code" onClick={() => { const source = text.split("\n"); source.splice(block.start + 1, block.end - block.start - 1); publish(source.join("\n")); }}>×</button>}
        {open && <div className="attached-code-area" onDragOver={event => event.preventDefault()} onDrop={event => {
          event.preventDefault();
          const inserted = event.dataTransfer.getData("text/plain");
          if (!inserted) return;
          const source = text.split("\n");
          const moved=event.dataTransfer.getData("application/x-script-editor-lines");
          let insertion=block.markerEnd;
          if(moved){try{const range=JSON.parse(moved) as {start:number;end:number};if(range.start<block.start||range.start>=block.end){source.splice(range.start,range.end-range.start);if(range.start<insertion)insertion-=range.end-range.start}}catch{/* external drag remains a copy */}}
          source.splice(insertion, 0, ...inserted.split("\n"));
          publish(source.join("\n"));
        }}><button type="button" className="code-drop-line" aria-label="Add text line" title="Add text line" onDragOver={event=>event.preventDefault()} onDrop={event=>dropAt(event,block.codeStart)} onClick={()=>{const source=text.split("\n");source.splice(block.codeStart,0,"");publish(source.join("\n"))}}/>{renderDialogueRange(block.codeStart,block.markerEnd,`attached-${block.start}`,{start:block.codeStart,end:block.markerEnd})}<button type="button" className="code-drop-line" aria-label="Add text line" title="Add text line" onDragOver={event=>event.preventDefault()} onDrop={event=>dropAt(event,block.markerEnd)} onClick={()=>{const source=text.split("\n");source.splice(block.markerEnd,0,"");publish(source.join("\n"))}}/></div>} 
      </section>;
    };

    for (let i = 0; i < lines.length;) {
      if (/^\s*@stage\s+/i.test(lines[i])) { i++; continue; }
      if (i === firstSceneLine) { const bundled = sceneDelayInfo(i); i = bundled ? bundled.delayLine + 1 : i + 1; continue; }
      if (/^\s*@scene\s+/i.test(lines[i])) { const bundled = sceneDelayInfo(i); result.push(sceneControl(i, true)); i = bundled ? bundled.delayLine + 1 : i + 1; continue; }
      if (delayAt(i)) { result.push(delayControl(i)); i++; continue; }
      if (mediaAt(i)) { result.push(mediaControl(i)); i++; continue; }
      if (/^\s*\[Shot\s*:\s*(?:Wide|Closeup)\s*\]\s*$/i.test(lines[i])) { result.push(shotControl(i)); i++; continue; }
      if (socketAt(i)) { result.push(socketControl(i)); i++; continue; }
      const inlineCode = inlineCodeAt(i);
      if (inlineCode) { result.push(renderInlineCode(inlineCode)); i = inlineCode.end; continue; }
      const attachedCode = attachedCodeAt(i);
      if (attachedCode) { result.push(renderAttachedCode(attachedCode)); i = attachedCode.end; continue; }
      const firstChoice = choiceAt(i);
      const dialogue = dialogueAt(i);
      if (dialogue) {
        let nextStart = dialogue.end;
        while (nextStart < lines.length && !lines[nextStart].trim()) nextStart++;
        const next = dialogueAt(nextStart);
        const firstDirection = dialogue.condition?.[2].startsWith(">") ? "positive" : dialogue.condition?.[2].startsWith("<") ? "negative" : "";
        const nextDirection = next?.condition?.[2].startsWith(">") ? "positive" : next?.condition?.[2].startsWith("<") ? "negative" : "";
        if (next && firstDirection && nextDirection && firstDirection !== nextDirection) {
          result.push(<div className="dialogue-pair" key={`pair-${i}`}>{renderDialogue(dialogue)}{renderDialogue(next)}</div>);
          i = next.end;
        } else { result.push(renderDialogue(dialogue)); i = dialogue.end; }
        continue;
      }
      if (!firstChoice) {
        const start = i;
        while (i < lines.length && !choiceAt(i) && !dialogueAt(i) && !attachedCodeAt(i) && !inlineCodeAt(i) && !delayAt(i) && !mediaAt(i) && !socketAt(i) && !/^\s*\[Shot\s*:\s*(?:Wide|Closeup)\s*\]\s*$/i.test(lines[i]) && !/^\s*@(?:stage|scene)\s+/i.test(lines[i])) i++;
        const end = i;
        const value = lines.slice(start, end).join("\n");
        const offset = start === 0 ? 0 : lines.slice(0, start).join("\n").length + 1;
        result.push(<textarea
          key={`text-${start}`}
          className="passage-text-section"
          aria-label="Screenplay text"
          value={value}
          rows={Math.max(1, end - start)}
          ref={element => { if (element === document.activeElement) editor.current = element; }}
          onFocus={event => { editor.current = event.currentTarget; activeOffset.current = offset; readCurrentMode(); }}
          onChange={event => {
            editor.current = event.currentTarget;
            activeOffset.current = offset;
            selection.current = { start: offset + event.target.selectionStart, end: offset + event.target.selectionEnd };
            updateTextSection(start, end, event.target.value);
            setMode(modeAt(text, selection.current.start));
          }}
          onClick={readCurrentMode}
          onKeyUp={readCurrentMode}
          onSelect={readCurrentMode}
          onContextMenu={event => {
            if (event.currentTarget.selectionStart === event.currentTarget.selectionEnd) return;
            const localLine = event.currentTarget.value.slice(0, event.currentTarget.selectionStart).split("\n").length - 1;
            if (!/^\s*;/.test(lines[start + localLine] || "")) return;
            event.preventDefault();
            setCodeMenu({ line: start + localLine, x: event.clientX, y: event.clientY });
          }}
          onKeyDown={event => {
            if (event.ctrlKey && (event.key.toLowerCase() === "d" || event.key.toLowerCase() === "o")) {
              event.preventDefault();
              editor.current = event.currentTarget;
              activeOffset.current = offset;
              insertAtCursor(event.key.toLowerCase() === "d" ? "dialogue" : "option");
              return;
            }
            if (event.key !== "Tab") return;
            event.preventDefault();
            editor.current = event.currentTarget;
            activeOffset.current = offset;
            selection.current = { start: offset + event.currentTarget.selectionStart, end: offset + event.currentTarget.selectionEnd };
            const current = modeAt(text, selection.current.start);
            applyMode((event.shiftKey ? (current + 2) % 3 : (current + 1) % 3) as TypingMode);
          }}
          spellCheck
        />);
        continue;
      }
      const choices = [firstChoice];
      let end = firstChoice.end;
      while (end < lines.length) {
        let nextStart = end;
        while (nextStart < lines.length && !lines[nextStart].trim()) nextStart++;
        const next = choiceAt(nextStart);
        if (!next) break;
        choices.push(next);
        end = next.end;
      }
      result.push(<span className="choice-bundle" key={`choices-${i}`}>{choices.map(renderChoice)}</span>);
      i = end;
    }
    if(!/^\s*Continue\s*:\s*\[\[[^\]]+\]\]\s*$/i.test(lines.filter(line=>line.trim()).at(-1)||""))result.push(<span className="script-socket default unbound" key="default-socket" title="Unset passage link">Unset link</span>);
    return result;
  };

  if(sourceMode)return <><div className="typing-hotkeys"><span>Shift+Tab</span> Return to screenplay</div><div className="passage-segmented-editor source-mode"><textarea autoFocus spellCheck aria-label="Passage source" value={text} onChange={event=>publish(event.target.value)} onKeyDown={event=>{if(event.shiftKey&&event.key==="Tab"){event.preventDefault();event.stopPropagation();setSourceMode(false)}}}/></div></>;
  return <>
    <div className="typing-hotkeys"><span>Ctrl+D</span> Dialogue <span>Ctrl+O</span> Option</div>
    <div ref={formatted} className="passage-segmented-editor">
      {formattedScreenplay()}
    </div>
    {optionMenu && <div className="option-context-menu editor-context-menu" style={{ left: optionMenu.x, top: optionMenu.y }}>
      <button type="button" onClick={() => addOptionFeature("variable")}>± Add buff/debuff</button>
      <button type="button" onClick={() => addOptionFeature("passage")}>↳ Add passage below</button>
      <button type="button" onClick={() => addOptionFeature("socket")}>◁ Make socket</button>
      <button type="button" className="context-delete" onClick={() => deleteLines(optionMenu.start, optionMenu.end)}>× Delete option</button>
    </div>}
    {dialogueMenu && <div className="option-context-menu editor-context-menu" style={{ left: dialogueMenu.x, top: dialogueMenu.y }}>
      <button type="button" className="context-delete" onClick={() => deleteLines(dialogueMenu.start, dialogueMenu.end)}>× Delete dialogue</button>
    </div>}
    {codeMenu && <div className="option-context-menu editor-context-menu" style={{ left: codeMenu.x, top: codeMenu.y }}>
      <button type="button" onClick={attachCode}>💡 Add Code</button>
    </div>}
    {sceneMenu && <div className="option-context-menu editor-context-menu" style={{ left: sceneMenu.x, top: sceneMenu.y }}>
      <button type="button" onClick={() => {
        const source = text.split("\n");
        if (!/^\s*\[Delay\b/i.test(source[sceneMenu.line + 1] || "")) source.splice(sceneMenu.line + 1, 0, "[Delay 1s]");
        publish(source.join("\n")); setSceneMenu(undefined);
      }}>🕒 Add duration</button>
    </div>}
    {addPalette && <div className="add-palette-backdrop" onMouseDown={() => setAddPalette(false)}><div className="add-palette" onMouseDown={event => event.stopPropagation()}>
      <input autoFocus placeholder="Search things to add…" value={addSearch} onChange={event => setAddSearch(event.target.value)} onKeyDown={event=>{if(event.key!=="Enter")return;const first=[["Dialogue","                        Character\n            Dialogue"],["Option","* New option"],["Delay","[Delay 1s]"],["Change shot","[Shot : Wide]"],["Change scene",`@scene ${stageScenes[Object.keys(stageScenes)[0]][0]}`],["Play audio","@audio Asset"],["Play sequence","@sequence Asset"],["Play video","@video Asset"]].find(([label])=>label.toLowerCase().includes(addSearch.toLowerCase()));if(first){event.preventDefault();insertRawAtCursor(first[1])}}}/>
      <div>{[
        ["Dialogue", "                        Character\n            Dialogue"],
        ["Option", "* New option"],
        ["Delay", "[Delay 1s]"],
        ["Change shot", "[Shot : Wide]"],
        ["Change scene", `@scene ${stageScenes[Object.keys(stageScenes)[0]][0]}`],
        ["Play audio", "@audio Asset"],
        ["Play sequence", "@sequence Asset"],
        ["Play video", "@video Asset"],
        ["Continue socket", "Continue: [[]]"],
      ].filter(([label]) => label.toLowerCase().includes(addSearch.toLowerCase())).map(([label, raw]) => <button type="button" key={label} onClick={() => insertRawAtCursor(raw)}>{label}</button>)}</div>
    </div></div>}
  </>;
}
