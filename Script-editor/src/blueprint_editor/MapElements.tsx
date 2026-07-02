import { memo, useEffect, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, NodeResizer, Position, getBezierPath, useReactFlow, type EdgeProps, type NodeProps } from "@xyflow/react";
import type { EdgeRoute, Point, SocketMeta, StoryGroup } from "../core/types";

export type PassageNodeData = { label:string; start:boolean; sockets:SocketMeta[]; hasTerminalContinue:boolean; collapsed:boolean; onToggle():void };
export type GroupNodeData = StoryGroup & { collapsed:boolean; onToggle():void; onColor(color:string):void };
export type StageLaneData = { stage:string; color:string };
export const StartNode=memo(()=> <div className="blueprint-start-node" title="Story starts here"><strong>START</strong><Handle id="start-out" type="source" position={Position.Right}/></div>);

const ChipIcon=({start=false}:{start?:boolean})=><svg className="chip-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={start?"M12 3 14.7 8.5 21 9.4l-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.4l6.3-.9Z":"M7 3v4M12 3v4M17 3v4M7 17v4M12 17v4M17 17v4M3 7h4M3 12h4M3 17h4M17 7h4M17 12h4M17 17h4M8 8h8v8H8z"}/></svg>;

export const SocketPin=({id,type,label,color,connected=false}:{id:string;type:"source"|"target";label:string;color?:string;connected?:boolean})=>
  <div className={`socket-pin socket-${type} ${connected?"is-powered":""}`} title={`${label}${connected?" • connected":""}`}>
    <Handle id={id} type={type} position={type==="source"?Position.Right:Position.Left} style={{"--socket-color":color||"#83d9a4"} as React.CSSProperties}/>
    <span>{label}</span>
  </div>;

export const ChipNode = memo(({data,selected}:NodeProps)=>{const d=data as unknown as PassageNodeData;return <article className={`blueprint-chip blueprint-chip-simple ${selected?"selected":""} ${d.start?"is-start":""}`} title={d.label}>
  <strong className="simple-chip-name">{d.label}</strong>
  <Handle id="in-left" type="target" position={Position.Left} className="simple-input"/>
  <div className="simple-outputs" title="Outputs">{(()=>{const outputs=[...d.sockets.map((s,i)=>({id:`socket-${i}`,key:s.id,label:s.target?s.label:"Unset link",color:s.target?s.color:"#9aa29d",terminal:false})),...(!d.hasTerminalContinue?[{id:"default-socket",key:"default",label:"End",color:"#8d9690",terminal:true}]:[])];return outputs.map((output,index)=><span key={output.key} className={`simple-output-wrap${output.terminal?" terminal":""}`} style={{top:`${((index+.5)/outputs.length)*100}%`,"--socket-color":output.color} as React.CSSProperties}><Handle id={output.id} type="source" position={Position.Right} className="simple-output"/><span className="socket-speech">{output.label}</span></span>)})()}</div>
  <Handle id="in-top" type="target" position={Position.Top} className="legacy-handle"/><Handle id="in-right" type="target" position={Position.Right} className="legacy-handle"/><Handle id="in-bottom" type="target" position={Position.Bottom} className="legacy-handle"/>
  <Handle id="out-top" type="source" position={Position.Top} className="legacy-handle"/><Handle id="out-left" type="source" position={Position.Left} className="legacy-handle"/><Handle id="out-bottom" type="source" position={Position.Bottom} className="legacy-handle"/>
  </article>});
export const PassageNode=ChipNode;

export const StageLane=memo(({data}:NodeProps)=>{const d=data as unknown as StageLaneData;return <div className="stage-lane" style={{"--stage-color":d.color} as React.CSSProperties} title={d.stage}><span>{d.stage}</span></div>});

export const ChipSection=memo(({data,selected}:NodeProps)=>{const d=data as unknown as GroupNodeData;return <section className={`chip-section ${selected?"selected":""} ${d.collapsed?"is-collapsed":""}`} style={{"--section-color":d.color} as React.CSSProperties} title={d.name}>
  <NodeResizer minWidth={240} minHeight={d.collapsed?54:160} isVisible={selected&&!d.collapsed} color={d.color}/><header><ChipIcon/><span className="section-header-line"/><label className="section-color nodrag" title="Section colour"><input aria-label="Section colour" type="color" value={d.color} onChange={e=>d.onColor(e.target.value)}/></label><button className="chip-toggle nodrag" onClick={d.onToggle} aria-label={d.collapsed?"Expand section":"Collapse section"}>{d.collapsed?"＋":"−"}</button></header>
  </section>});
export const GroupNode=ChipSection;

export function Wire(props:EdgeProps){const [path]=getBezierPath({sourceX:props.sourceX,sourceY:props.sourceY,sourcePosition:props.sourcePosition,targetX:props.targetX,targetY:props.targetY,targetPosition:props.targetPosition,curvature:.35});const data=props.data as {color?:string;powered?:boolean}|undefined,color=data?.color||"#78d99d",gradientId=`fade-${props.id.replace(/[^a-zA-Z0-9_-]/g,"-")}`;return <g className={`blueprint-wire ${data?.powered?"is-powered":""} ${props.selected?"selected":""}`} style={{"--wire-color":color} as React.CSSProperties}><defs><linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={props.sourceX} y1={props.sourceY} x2={props.targetX} y2={props.targetY}><stop offset="0" stopColor={color}/><stop offset=".5" stopColor={color} stopOpacity=".12"/><stop offset="1" stopColor={color}/></linearGradient></defs><path className="wire-halo" d={path}/><BaseEdge id={props.id} path={path}/><path className="wire-node-fade" d={path} stroke={`url(#${gradientId})`}/></g>}

const segmentPath=(points:Point[])=>points.length<2?"":points.slice(1).map((p,i)=>`${i?"L":"M"} ${points[i].x} ${points[i].y} L ${p.x} ${p.y}`).join(" ");
export function RoutedEdge(props:EdgeProps){const {getZoom}=useReactFlow();const route=props.data as unknown as EdgeRoute&{powered?:boolean;update(points:Point[]):void};const [draft,setDraft]=useState<Point[]|null>(null),[selectedPoint,setSelectedPoint]=useState<number|null>(null),routePoints=draft||(route.points||[]),points=[{x:props.sourceX,y:props.sourceY},...routePoints,{x:props.targetX,y:props.targetY}],path=segmentPath(points),color=route.color||"#78d99d";useEffect(()=>{if(selectedPoint===null)return;const remove=(event:KeyboardEvent)=>{if(event.key!=="Delete"&&event.key!=="Backspace")return;event.preventDefault();route.update(route.points.filter((_,index)=>index!==selectedPoint));setSelectedPoint(null)};window.addEventListener("keydown",remove);return()=>window.removeEventListener("keydown",remove)},[route,selectedPoint]);return <g className={`blueprint-wire routed ${route.powered?"is-powered":""} ${props.selected?"selected":""}`} style={{"--wire-color":color} as React.CSSProperties}><path className="wire-halo" d={path}/><BaseEdge id={props.id} path={path}/><EdgeLabelRenderer>{routePoints.map((p,i)=><button key={i} className={`route-point nodrag nopan ${selectedPoint===i?"selected":""}`} aria-label="Route point" style={{transform:`translate(-50%,-50%) translate(${p.x}px,${p.y}px)`,borderColor:color}} onClick={event=>{event.stopPropagation();setSelectedPoint(i)}} onPointerDown={event=>{event.preventDefault();event.stopPropagation();setSelectedPoint(i);const start={x:event.clientX,y:event.clientY},original={...p};let latest=[...routePoints],moved=false;const move=(e:PointerEvent)=>{if(Math.abs(e.clientX-start.x)+Math.abs(e.clientY-start.y)>2)moved=true;const next=[...routePoints];next[i]={x:original.x+(e.clientX-start.x)/getZoom(),y:original.y+(e.clientY-start.y)/getZoom()};latest=next;setDraft(next)};const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up);setDraft(null);if(moved)route.update(latest)};window.addEventListener("pointermove",move);window.addEventListener("pointerup",up)}} onDoubleClick={()=>{route.update(route.points.filter((_,n)=>n!==i));setSelectedPoint(null)}}/>)}</EdgeLabelRenderer></g>}

export function nearestHandles(){return {sourceHandle:"default-socket",targetHandle:"in-left"}}
