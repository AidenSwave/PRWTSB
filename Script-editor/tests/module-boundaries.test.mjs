import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("shared core does not depend on either editor UI", async () => {
  const sources = await Promise.all(["types.ts", "story-html.ts", "screenplay.ts"].map(name => readFile(new URL(`../src/core/${name}`, import.meta.url), "utf8")));
  for (const source of sources) assert.doesNotMatch(source, /(?:text_editor|blueprint_editor|@xyflow|react)/i);
});

test("both editor modes consume the same core story model", async () => {
  const [textEditor, blueprintEditor] = await Promise.all([
    readFile(new URL("../src/text_editor/TextEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/blueprint_editor/BlueprintEditor.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(textEditor, /from "\.\.\/core\/types"/);
  assert.match(blueprintEditor, /from "\.\.\/core\/types"/);
  assert.doesNotMatch(textEditor, /parseStory|serializeStory/);
  assert.doesNotMatch(blueprintEditor, /parseStory|serializeStory/);
});

test("blueprint presentation remains isolated from the text editor", async () => {
  const [blueprint, elements, textEditor] = await Promise.all([
    readFile(new URL("../src/blueprint_editor/BlueprintEditor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/blueprint_editor/MapElements.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/text_editor/TextEditor.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(blueprint, /BlueprintToolbar/);
  assert.match(elements, /ChipNode/);
  assert.doesNotMatch(textEditor, /blueprint|@xyflow/i);
});
