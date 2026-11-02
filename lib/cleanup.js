import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { Scanner } from "./scanner.js";
import { formatSize, getErrorMessage, printProgress } from "./utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PREVIEW_LIMIT = 10;

export class Cleanup extends EventEmitter {
  async clean(rootPath, olderThanDays, { dryRun = true } = {}) {
    const files = await this.findOldFiles(rootPath, olderThanDays);
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    this.emit("search-complete", { files, totalSize });

    const deleted = dryRun
      ? { deletedFiles: 0, freedSize: 0 }
      : await this.deleteFiles(files);

    const result = { dryRun, foundFiles: files.length, totalSize, ...deleted };
    this.emit("cleanup-complete", result);
    return result;
  }

  async findOldFiles(rootPath, olderThanDays) {
    const scanner = new Scanner();
    const filePaths = await scanner.getAllFiles(rootPath);
    const now = Date.now();
    const oldFiles = [];

    for (const filePath of filePaths) {
      let fileData;

      try {
        fileData = await scanner.getFileInfo(filePath);
      } catch (error) {
        this.emit("file-skipped", { path: filePath, error });
        continue;
      }

      const ageDays = (now - fileData.mtime.getTime()) / DAY_MS;
      if (ageDays > olderThanDays) {
        const oldFile = { ...fileData, ageDays };
        oldFiles.push(oldFile);
        this.emit("file-found", oldFile);
      }
    }

    return oldFiles.sort((a, b) => b.ageDays - a.ageDays);
  }

  async deleteFiles(files) {
    let deletedFiles = 0;
    let freedSize = 0;

    for (const file of files) {
      try {
        await fs.unlink(file.path);
      } catch (error) {
        this.emit("delete-error", { path: file.path, error });
        continue;
      }

      deletedFiles++;
      freedSize += file.size;
      this.emit("file-deleted", file);
    }

    return { deletedFiles, freedSize };
  }
}

export async function cleanupCommand(targetPath, olderThanArg, confirm) {
  const olderThanDays = Number(olderThanArg);

  if (!targetPath || !Number.isInteger(olderThanDays) || olderThanDays <= 0) {
    console.error(
      "❌ Потрібно вказати директорію та --older-than <ціле число днів, більше 0>",
    );
    console.log(
      "Використання: node file-organizer.js cleanup <шлях> --older-than <днів> [--confirm]",
    );
    process.exitCode = 1;
    return;
  }

  const root = path.resolve(targetPath);

  if (root === path.parse(root).root) {
    console.error(`❌ Не можна чистити корінь диска: ${root}`);
    process.exitCode = 1;
    return;
  }

  console.log(`🧹 Cleanup: ${root}`);
  console.log(`Looking for files older than ${olderThanDays} days...`);

  const cleanup = new Cleanup();
  const skipped = [];
  const failed = [];
  let total = 0;
  let processed = 0;

  function onFileProcessed() {
    processed++;
    printProgress("Deleting...", processed, total);
  }

  cleanup.on("file-skipped", (item) => {
    skipped.push(item);
  });

  cleanup.on("search-complete", ({ files, totalSize }) => {
    total = files.length;
    printFoundFiles(files, totalSize, root, olderThanDays);

    if (confirm && files.length > 0) {
      console.log(
        `\n⚠️  DELETING ${files.length} files (${formatSize(totalSize)}). This action cannot be undone!\n`,
      );
    }
  });

  cleanup.on("file-deleted", onFileProcessed);

  cleanup.on("delete-error", (item) => {
    failed.push(item);
    onFileProcessed();
  });

  cleanup.on("cleanup-complete", (result) => {
    if (result.foundFiles > 0) printResult(result);
    printWarnings("Пропущено", skipped);
    printWarnings("Не видалено", failed);
  });

  try {
    await cleanup.clean(root, olderThanDays, { dryRun: !confirm });
  } catch (error) {
    console.error(`❌ ${getErrorMessage(error)}: ${error.path ?? root}`);
    process.exitCode = 1;
  }
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function printFoundFiles(files, totalSize, root, olderThanDays) {
  if (files.length === 0) {
    console.log(`\n✅ No files older than ${olderThanDays} days found.`);
    return;
  }

  const divider = "━".repeat(34);

  console.log(`\nFound ${files.length} files to delete:\n`);
  console.log(divider);

  for (const file of files.slice(0, PREVIEW_LIMIT)) {
    console.log(path.relative(root, file.path));
    console.log(`  Size: ${formatSize(file.size)}`);
    console.log(
      `  Modified: ${Math.floor(file.ageDays)} days ago (${formatDate(file.mtime)})\n`,
    );
  }

  const hiddenCount = files.length - PREVIEW_LIMIT;
  if (hiddenCount > 0) {
    console.log(`... (${hiddenCount} more files)`);
  }

  console.log(divider);
  console.log(`\nTotal: ${files.length} files (${formatSize(totalSize)})`);
}

function printResult({ dryRun, deletedFiles, freedSize }) {
  if (dryRun) {
    console.log("\n⚠️  DRY RUN MODE: No files were deleted.");
    console.log("To actually delete these files, run with --confirm flag.");
    return;
  }

  console.log("\n\n✅ Cleanup complete!");
  console.log(
    `Deleted: ${deletedFiles} files (${formatSize(freedSize)} freed)`,
  );
}

function printWarnings(label, items) {
  for (const { path: filePath, error } of items) {
    console.warn(`⚠️  ${label} (${getErrorMessage(error)}): ${filePath}`);
  }
}
