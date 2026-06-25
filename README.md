# sbt-connect

Next.js dashboard and bot operations app for scheduled workflows, automation tooling, and operational monitoring.

## Features

- Dashboard interface for operational tasks.
- Scheduled jobs with cron-style automation.
- Prisma-backed data layer.
- Authentication and validation workflows.
- Playwright-based automation support.

## Tech Stack

- Next.js
- TypeScript
- Prisma
- Tailwind CSS
- Node Cron
- Playwright

## Getting Started

```bash
npm install
npm run dev
```

Prepare the database layer:

```bash
npm run prisma:generate
```

## Environment Variables

Copy `.env.example` to `.env` and fill in local values:

```bash
cp .env.example .env
```

Do not commit real `.env` files.

## Status

Active dashboard and automation project.