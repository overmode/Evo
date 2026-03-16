import * as fs from "node:fs";
import * as path from "node:path";

/** Recursively copy a directory. */
export async function copyDirRecursive(src: string, dest: string) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

/** Sets up the workspace: copies templates and base skills on first run. */
export async function bootstrap(workspace: string, templates: string) {
  const piDir = path.join(workspace, ".pi");

  await fs.promises.mkdir(path.join(workspace, "sessions"), { recursive: true });
  await fs.promises.mkdir(piDir, { recursive: true });

  for (const file of ["AGENTS.md", "SYSTEM.md"]) {
    const target = path.join(piDir, file);
    if (!fs.existsSync(target)) {
      await fs.promises.copyFile(path.join(templates, file), target);
    }
  }

  const skillsSrc = path.join(templates, "skills");
  const skillsDest = path.join(piDir, "skills");
  if (fs.existsSync(skillsSrc) && !fs.existsSync(skillsDest)) {
    await copyDirRecursive(skillsSrc, skillsDest);
  }
}
