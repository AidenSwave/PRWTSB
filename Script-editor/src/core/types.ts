export type Passage = { pid: string; name: string; tags: string; position: { x: number; y: number }; size: string; text: string; attributes: Record<string, string> };
export type Point = { x: number; y: number };
export type StoryGroup = { id: string; name: string; position: Point; width: number; height: number; color: string };
export type EdgeRoute = { id: string; source: string; target: string; sourceSocket?: string; points: Point[]; color?: string };
export type SocketMeta = { id: string; passageId: string; label: string; target?: string; color: string };
export type EditorMetadata = { version: 1; groups: StoryGroup[]; routes: EdgeRoute[]; sockets: SocketMeta[]; collapsedChoices: string[] };
export type Story = { html: string; storyAttributes: Record<string, string>; passages: Passage[]; metadata: EditorMetadata };
export type DesktopBridge = {
  open(): Promise<{path:string;name:string;html:string}|null>;
  save(payload:{path?:string;html:string;saveAs?:boolean}):Promise<{path:string;name:string}|null>;
  preview(html:string):Promise<{url:string}>;
  setTitle(title:string):void;
  onPreviewError(callback:(message:string)=>void):()=>void;
};
declare global { interface Window { desktop?: DesktopBridge } }
