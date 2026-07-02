import test from "node:test";
import assert from "node:assert/strict";
const fixture = `<!doctype html><html><head><script>window.SugarCube = {};</script></head><body>
<tw-storydata name="Example Story" startnode="1">
<tw-passagedata pid="1" name="Start" tags="" position="100,100" size="100,100">[[Next]]</tw-passagedata>
<tw-passagedata pid="2" name="Next" tags="" position="300,100" size="100,100"></tw-passagedata>
</tw-storydata></body></html>`;

test("the fixture has the expected Twine structure", () => {
  assert.match(fixture, /<tw-storydata\b/);
  assert.equal([...fixture.matchAll(/<tw-passagedata\b/g)].length, 2);
  assert.match(fixture, /name="Next"/);
});

test("SugarCube engine surrounds, rather than lives inside, storydata", () => {
  const storyStart = fixture.indexOf("<tw-storydata");
  assert.ok(storyStart > 0);
  assert.ok(fixture.indexOf("SugarCube", 0) < storyStart);
});
