import assert from "node:assert/strict";
import test from "node:test";

import { createProjectRunRequest } from "../src/lib/project-run-request.ts";

test("createProjectRunRequest posts a full run for the selected project", () => {
  const request = createProjectRunRequest(42);

  assert.equal(request.url, "/api/projects/42/run");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(request.init.headers, { "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(String(request.init.body)), { action: "full" });
});
