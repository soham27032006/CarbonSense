/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import {
  EQUIVALENCY_CONFIG,
  getForestMessage,
  getTreeCount,
} from "../src/lib/impactDisplay";

test("flight equivalencies keep a clean plane emoji", () => {
  assert.equal(EQUIVALENCY_CONFIG.flights_saved.icon, "✈️");
  assert.equal(EQUIVALENCY_CONFIG.flights_ny_to_la.icon, "✈️");
});

test("tree count stays at least one once carbon is saved", () => {
  assert.equal(getTreeCount(10.2), 1);
  assert.equal(getTreeCount(44), 2);
});

test("forest message matches the computed tree count", () => {
  assert.equal(getForestMessage(1), "Your first tree is growing!");
  assert.equal(getForestMessage(3), "Every challenge grows your forest 🌳");
});
