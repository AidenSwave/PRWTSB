import { useCallback, useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { BlueprintEditor } from "./blueprint_editor/BlueprintEditor";
import { parseStory, serializeStory, syncStorySockets } from "./core/story-html";
import type { Passage, Story, StoryGroup } from "./core/types";
import { TextEditor } from "./text_editor/TextEditor";
import { FlowEditor } from "./flow_editor/FlowEditor";

const palette=["#66d9c8","#7ea7ff","#c794f5","#ff9f7d","#f5cf6b","#78c98c"];
type EditorMode="text"|"flow"|"blueprint";

function preparePreviewRuntime(html:string){
  const marker="    styles = sortPaths(styles.map(function (path) {";
  if(!html.includes(marker)||html.includes("scriptEditorRuntimePriority"))return html;
  const ordering=`    var scriptEditorRuntimePriority = { "config.js": -30, "tools.js": -20, "startup.js": 100 };\n    scripts.sort(function (left, right) {\n      var leftName = left.split("/").pop().toLowerCase();\n      var rightName = right.split("/").pop().toLowerCase();\n      return (scriptEditorRuntimePriority[leftName] || 0) - (scriptEditorRuntimePriority[rightName] || 0);\n    });\n`;
  return html.replace(marker,ordering+marker);
}

export default function App(){return <ReactFlowProvider><AppShell/></ReactFlowProvider>}

function AppShell(){
  const desktop=window.desktop||(/^https?:$/.test(location.protocol)?{
    async open(){const response=await fetch("/Project%20Who.html");return response.ok?{path:"Project Who.html",name:"Project Who.html",html:await response.text()}:null},
    async save({path}:{path?:string}){return {path:path||"Project Who.html",name:(path||"Project Who.html").split("/").pop()||"Project Who.html"}},
    async preview(){throw new Error("Preview is available in the desktop app.")},
    setTitle(title:string){document.title=title},
    onPreviewError(){return()=>{}},
  }:undefined);
  if(!desktop)throw new Error("The Electron desktop bridge did not load.");
  const bridge=desktop;
  const [story,setStory]=useState<Story|null>(null),[path,setPath]=useState<string>(),[name,setName]=useState("No story open");
  const [mode,setMode]=useState<EditorMode>("blueprint"),[selectedPassage,setSelectedPassage]=useState<string>(),[dirty,setDirty]=useState(false),[status,setStatus]=useState("Open a Twine or SugarCube HTML story to begin.");
  const history=useRef<Story[]>([]),future=useRef<Story[]>([]),storyRef=useRef<Story|null>(null);
  useEffect(()=>{storyRef.current=story},[story]);
  const mutate=useCallback((next:Story)=>{const current=storyRef.current;if(current&&current!==next)history.current.push(current);future.current=[];const synced=syncStorySockets(next);storyRef.current=synced;setStory(synced);setDirty(true)},[]);
  const undo=useCallback(()=>{const current=storyRef.current,previous=history.current.pop();if(!current||!previous)return;future.current.push(current);storyRef.current=previous;setStory(previous);setDirty(true)},[]);
  const redo=useCallback(()=>{const current=storyRef.current,next=future.current.pop();if(!current||!next)return;history.current.push(current);storyRef.current=next;setStory(next);setDirty(true)},[]);
  async function openFile(){if(dirty&&!confirm("Discard unsaved changes and open another story?"))return;try{const file=await bridge.open();if(!file)return;const parsed=parseStory(file.html);setStory(parsed);setPath(file.path);setName(file.name);setSelectedPassage(undefined);setDirty(false);setStatus(`${parsed.passages.length} passages loaded.`)}catch(e){setStatus(e instanceof Error?e.message:String(e))}}
  async function save(saveAs=false){if(!story)return;try{const html=serializeStory(story);const result=await bridge.save({path,html,saveAs});if(!result)return;setPath(result.path);setName(result.name);setStory({...story,html});setDirty(false);setStatus("Saved successfully.")}catch(e){setStatus(`Save failed: ${e instanceof Error?e.message:String(e)}`)}}
  async function preview(){if(!story)return;try{const result=await bridge.preview(preparePreviewRuntime(serializeStory(story)));setStatus(`Preview running at ${result.url}`)}catch(e){setStatus(`Preview failed: ${e instanceof Error?e.message:String(e)}`)}}
  const addPassage=()=>{if(!story)return;const pid=String(Math.max(0,...story.passages.map(p=>Number(p.pid)||0))+1),index=story.passages.length;const passage:Passage={pid,name:`New Passage ${index+1}`,tags:"",position:{x:100+(index%4)*240,y:100+Math.floor(index/4)*170},size:"100,100",text:"",attributes:{}};mutate({...story,passages:[...story.passages,passage]});setSelectedPassage(pid);setMode("text")};
  const addGroup=()=>{if(!story)return;const group:StoryGroup={id:crypto.randomUUID(),name:"New section",position:{x:80,y:80},width:520,height:340,color:palette[story.metadata.groups.length%palette.length]};mutate({...story,metadata:{...story.metadata,groups:[...story.metadata.groups,group]}})};
  const changePassage=(passage:Passage)=>story&&mutate({...story,passages:story.passages.map(item=>item.pid===passage.pid?passage:item)});
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if(!(event.metaKey||event.ctrlKey))return;const key=event.key.toLowerCase();if(key==="s"){event.preventDefault();void save(event.shiftKey)}else if(key==="z"){event.preventDefault();event.shiftKey?redo():undo()}else if(key==="y"){event.preventDefault();redo()}};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)});
  useEffect(()=>bridge.onPreviewError(message=>setStatus(`Preview error: ${message}`)),[bridge]);
  useEffect(()=>{const passage=story?.passages.find(item=>item.pid===selectedPassage);bridge.setTitle(mode==="blueprint"?"Blueprint":`Script Editor: ${passage?.name||"Passage"}`)},[bridge,mode,selectedPassage,story?.passages]);
  return <main><header><div className="brand"><span className="mark">SE</span><div><strong>Script Editor</strong><small>{name}{dirty?" • Unsaved":""}</small></div></div><nav><button onClick={openFile}>Open</button><button disabled={!story} onClick={()=>save()}>Save</button><button disabled={!story} onClick={()=>save(true)}>Save As</button><span className="rule"/><button disabled={!story} onClick={addPassage}>+ Passage</button><button disabled={!story||mode!=="blueprint"} onClick={addGroup}>▧ Group</button><button disabled={!story} onClick={preview}>▶ Play</button><span className="rule"/><button className={mode==="text"?"active":""} disabled={!story} onClick={()=>setMode("text")}>Text</button><button className={mode==="flow"?"active":""} disabled={!story} onClick={()=>setMode("flow")}>Flow</button><button className={mode==="blueprint"?"active":""} disabled={!story} onClick={()=>setMode("blueprint")}>Blueprint</button></nav></header>
    {story?(mode==="blueprint"?<BlueprintEditor story={story} onChange={mutate} onOpenPassage={id=>{setSelectedPassage(id);setMode("flow")}}/>:mode==="flow"&&story.passages.length?<FlowEditor story={story} passage={story.passages.find(item=>item.pid===selectedPassage)||story.passages[0]} onSelectPassage={setSelectedPassage} onChangePassage={changePassage} onPreview={preview} onSave={()=>save()} onSaveAs={()=>save(true)} onChangeView={setMode}/>:<TextEditor story={story} selectedPassageId={selectedPassage} onSelectPassage={setSelectedPassage} onChangePassage={changePassage} onClose={()=>setMode("blueprint")} onOpenFlow={()=>setMode("flow")}/>):<section className="map full"><div className="welcome"><div className="logo">SE</div><h1>Your story, without the machinery in the way.</h1><p>Open an exported Twine HTML file to edit its passages and blueprint.</p><button onClick={openFile}>Open story HTML</button></div></section>}
    <footer><span className={dirty?"dot dirty":"dot"}/>{status}<span className="hint">{mode==="blueprint"?"Double-click a passage to edit its text • Double-click a connection to reroute":"Choose a passage from the list to edit"}</span><kbd>{navigator.platform.includes("Mac")?"⌘":"Ctrl"}+S</kbd></footer></main>;
}
