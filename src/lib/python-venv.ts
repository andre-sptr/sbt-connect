import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type PythonDependency = {
  name: string;
  version: string;
};

const venvRoot = path.join(process.cwd(), ".venv");
const pythonTempRoot = path.join(process.cwd(), "storage", "python-temp");
const blockedPythonPathParts = [
  `${path.sep}LibreOffice${path.sep}`,
  `${path.sep}WindowsApps${path.sep}python.exe`,
];

function venvPythonPath() {
  return process.platform === "win32"
    ? path.join(venvRoot, "Scripts", "python.exe")
    : path.join(venvRoot, "bin", "python");
}

function systemPythonExecutable() {
  return process.env.PYTHON_EXECUTABLE?.trim() || "python";
}

function isBlockedPythonPath(filePath: string) {
  const normalized = path.normalize(filePath);
  return blockedPythonPathParts.some((part) => normalized.includes(part));
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findLocalWindowsPython() {
  if (process.platform !== "win32") return null;

  const roots = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "Python") : null,
    path.join(process.env.SystemDrive || "C:", "Program Files", "Python"),
  ].filter(Boolean) as string[];

  const candidates: string[] = [];
  for (const root of roots) {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.toLowerCase().startsWith("python")) continue;
        candidates.push(path.join(root, entry.name, "python.exe"));
      }
    } catch {
      // Optional install locations may not exist on every machine.
    }
  }

  const existing = [];
  for (const candidate of candidates) {
    if (!isBlockedPythonPath(candidate) && (await fileExists(candidate))) existing.push(candidate);
  }

  return existing.sort((left, right) => right.localeCompare(left, undefined, { numeric: true })).at(0) || null;
}

async function resolveSystemPythonExecutable() {
  const configured = process.env.PYTHON_EXECUTABLE?.trim();
  if (configured) return configured;

  const localWindowsPython = await findLocalWindowsPython();
  if (localWindowsPython) return localWindowsPython;

  return systemPythonExecutable();
}

export async function getPythonProcessEnv() {
  await fs.mkdir(pythonTempRoot, { recursive: true });
  return {
    ...process.env,
    TMP: pythonTempRoot,
    TEMP: pythonTempRoot,
    TMPDIR: pythonTempRoot,
  };
}

async function venvConfigUsesBlockedPython() {
  try {
    const config = await fs.readFile(path.join(venvRoot, "pyvenv.cfg"), "utf8");
    return /LibreOffice|python-core-\d/i.test(config);
  } catch {
    return false;
  }
}

export async function venvExists() {
  if (!(await fileExists(venvPythonPath()))) return false;
  if (await venvConfigUsesBlockedPython()) return false;

  try {
    const result = await runCommand(venvPythonPath(), ["-m", "pip", "--version"], { timeoutMs: 10_000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function getPythonExecutable() {
  return (await venvExists()) ? venvPythonPath() : resolveSystemPythonExecutable();
}

async function runCommand(command: string, args: string[], options?: { timeoutMs?: number }) {
  const env = await getPythonProcessEnv();
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      windowsHide: true,
    });

    const timeout = options?.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`Command timeout setelah ${Math.round((options.timeoutMs || 0) / 1000)} detik.`));
        }, options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (timeout) clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode });
    });
  });
}

export async function ensureVenv() {
  if (await venvExists()) return;
  const pythonExecutable = await resolveSystemPythonExecutable();
  if (isBlockedPythonPath(pythonExecutable)) {
    throw new Error(
      `Python yang terdeteksi adalah Python embedded LibreOffice (${pythonExecutable}). Isi PYTHON_EXECUTABLE dengan path Python normal, misalnya C:\\Users\\<user>\\AppData\\Local\\Programs\\Python\\Python313\\python.exe.`
    );
  }

  const result = await runCommand(pythonExecutable, ["-m", "venv", "--clear", ".venv"], { timeoutMs: 120_000 });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Gagal membuat .venv.");
  }
}

export async function listPythonDependencies() {
  if (!(await venvExists())) {
    return {
      venvPath: venvRoot,
      pythonPath: await resolveSystemPythonExecutable(),
      venvExists: false,
      packages: [] as PythonDependency[],
    };
  }

  const result = await runCommand(venvPythonPath(), ["-m", "pip", "list", "--format=json"], { timeoutMs: 60_000 });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Gagal membaca dependency Python.");
  }

  const parsed = JSON.parse(result.stdout || "[]") as Array<{ name?: string; version?: string }>;
  return {
    venvPath: venvRoot,
    pythonPath: venvPythonPath(),
    venvExists: true,
    packages: parsed
      .filter((item) => item.name && item.version)
      .map((item) => ({ name: String(item.name), version: String(item.version) }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function validatePackageSpec(packageSpec: string) {
  const value = packageSpec.trim();
  if (!value) return null;
  if (value.length > 120) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(\[[A-Za-z0-9_,.-]+\])?([<>=!~]=?[A-Za-z0-9.*+!_-]+)?$/.test(value)) {
    return null;
  }
  return value;
}

export async function installPythonDependency(packageSpec: string) {
  const normalized = validatePackageSpec(packageSpec);
  if (!normalized) throw new Error("Nama package tidak valid.");

  await ensureVenv();
  const result = await runCommand(venvPythonPath(), ["-m", "pip", "install", normalized], { timeoutMs: 300_000 });
  if (result.exitCode !== 0) {
    throw new Error((result.stderr || result.stdout).trim() || "Install dependency gagal.");
  }
  return {
    packageSpec: normalized,
    output: [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n").slice(-5000),
  };
}
