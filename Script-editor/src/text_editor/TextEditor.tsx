import type { Passage, Story } from "../core/types";
import { PassageEditor } from "./PassageEditor";

export function TextEditor({ story, selectedPassageId, onSelectPassage, onChangePassage, onClose }: {
  story: Story;
  selectedPassageId?: string;
  onSelectPassage(id?: string): void;
  onChangePassage(passage: Passage): void;
  onClose(): void;
}) {
  const current = story.passages.find(passage => passage.pid === selectedPassageId);
  return <section className="text-editor-mode">
    <aside className="passage-list" aria-label="Passages">
      <h2>Passages</h2>
      {story.passages.map(passage => <button className={passage.pid === selectedPassageId ? "active" : ""} key={passage.pid} onClick={() => onSelectPassage(passage.pid)}>
        {passage.pid === story.storyAttributes.startnode && <span>★ </span>}{passage.name}
      </button>)}
    </aside>
    <div className="text-editor-empty">{current ? "" : "Choose a passage to edit."}</div>
    {current && <PassageEditor key={current.pid} passage={current} onClose={onClose} onChange={onChangePassage} onOpenPassage={name=>onSelectPassage(story.passages.find(passage=>passage.name===name)?.pid)}/>} 
  </section>;
}
