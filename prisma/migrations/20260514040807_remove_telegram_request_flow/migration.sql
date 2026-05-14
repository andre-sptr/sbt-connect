/*
  Warnings:

  - You are about to drop the `TelegramConversationState` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TelegramRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TelegramConversationState";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TelegramRequest";
PRAGMA foreign_keys=on;
