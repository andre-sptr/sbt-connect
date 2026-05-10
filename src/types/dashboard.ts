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
  maxRetries: number;
  retryDelayMinutes: number;
  publicToken: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TelegramRequestDto = {
  id: number;
  telegramUpdateId: string | null;
  telegramMessageId: string | null;
  chatId: string;
  chatType: string | null;
  chatTitle: string | null;
  userId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  picName: string | null;
  picNik: string | null;
  picUnit: string | null;
  projectName: string | null;
  groupIds: string[];
  spreadsheetUrl: string | null;
  gid: string | null;
  cellRange: string | null;
  caption: string | null;
  cronExpression: string | null;
  rawMessage: string;
  status: "pending" | "approved" | "rejected" | string;
  validationError: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  projectId: number | null;
  project: { id: number; name: string } | null;
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
  thumbnailPath: string | null;
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

export type PythonJobDto = {
  id: number;
  name: string;
  originalFilename: string;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  timeoutSeconds: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PythonRunDto = {
  id: number;
  pythonJobId: number;
  source: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  timedOut: boolean;
  errorSummary: string | null;
};

export type PythonJobLogDto = {
  id: number;
  pythonJobId: number;
  pythonRunId: number | null;
  level: string;
  stream: string;
  message: string;
  createdAt: string;
};

export type PythonDependencyDto = {
  name: string;
  version: string;
};
