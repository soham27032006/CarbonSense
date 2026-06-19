/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_META, getGreetingForHour } from "../src/lib/homeDisplay";

test("afternoon greeting keeps the sun emoji in UTF-8", () => {
  assert.deepEqual(getGreetingForHour(14), ["Good afternoon", "☀️"]);
});

test("home category emojis stay readable", () => {
  assert.equal(CATEGORY_META.travel.emoji, "✈️");
  assert.equal(CATEGORY_META.other.emoji, "○");
});
