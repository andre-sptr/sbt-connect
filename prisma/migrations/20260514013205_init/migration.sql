-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "telegramChatId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "requestedUsername" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "adminMessageId" TEXT,
    "reviewedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "groupIds" TEXT NOT NULL,
    "spreadsheetUrl" TEXT NOT NULL,
    "gid" TEXT NOT NULL,
    "cellRange" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxRetries" INTEGER NOT NULL DEFAULT 0,
    "retryDelayMinutes" INTEGER NOT NULL DEFAULT 5,
    "publicToken" TEXT,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdByUserId" INTEGER,
    CONSTRAINT "Project_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramUpdateId" TEXT,
    "telegramMessageId" TEXT,
    "chatId" TEXT NOT NULL,
    "chatType" TEXT,
    "chatTitle" TEXT,
    "userId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "picName" TEXT,
    "picNik" TEXT,
    "picUnit" TEXT,
    "projectName" TEXT,
    "groupIds" TEXT,
    "groupNames" TEXT,
    "spreadsheetUrl" TEXT,
    "gid" TEXT,
    "cellRange" TEXT,
    "caption" TEXT,
    "cronExpression" TEXT,
    "rawMessage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "validationError" TEXT,
    "rejectionReason" TEXT,
    "reviewedAt" DATETIME,
    "adminMessageId" TEXT,
    "projectId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelegramRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelegramConversationState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Run" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "errorSummary" TEXT,
    "screenshotPath" TEXT,
    "thumbnailPath" TEXT,
    CONSTRAINT "Run_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Log" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER,
    "runId" INTEGER,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Log_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Log_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CachedGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "remote" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "refreshedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PythonJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 600,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PythonRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pythonJobId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "exitCode" INTEGER,
    "timedOut" BOOLEAN NOT NULL DEFAULT false,
    "errorSummary" TEXT,
    CONSTRAINT "PythonRun_pythonJobId_fkey" FOREIGN KEY ("pythonJobId") REFERENCES "PythonJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PythonJobLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pythonJobId" INTEGER NOT NULL,
    "pythonRunId" INTEGER,
    "level" TEXT NOT NULL DEFAULT 'info',
    "stream" TEXT NOT NULL DEFAULT 'status',
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PythonJobLog_pythonJobId_fkey" FOREIGN KEY ("pythonJobId") REFERENCES "PythonJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PythonJobLog_pythonRunId_fkey" FOREIGN KEY ("pythonRunId") REFERENCES "PythonRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserRequest_chatId_key" ON "UserRequest"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_publicToken_key" ON "Project"("publicToken");

-- CreateIndex
CREATE INDEX "TelegramRequest_status_createdAt_idx" ON "TelegramRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramRequest_projectId_idx" ON "TelegramRequest"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConversationState_chatId_key" ON "TelegramConversationState"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "CachedGroup_remote_key" ON "CachedGroup"("remote");
