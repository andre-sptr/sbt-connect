export function createProjectRunRequest(projectId: number) {
  return {
    url: `/api/projects/${projectId}/run`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "full" }),
    } satisfies RequestInit,
  };
}
