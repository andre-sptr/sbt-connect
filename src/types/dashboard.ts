export type ProjectDto = {
  id: number;
  name: string;
  groupIds: string[];
  spreadsheetUrl: string;
  gid: string;
  cellRange: string;
  caption: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RunDto = {
  id: number;
  projectId: number;
  action: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorSummary: string | null;
  screenshotPath: string | null;
  project?: { name: string };
};

export type LogDto = {
  id: number;
  projectId: number | null;
  runId: number | null;
  level: string;
  message: string;
  createdAt: string;
  project?: { name: string } | null;
  run?: { status: string; action: string } | null;
};
