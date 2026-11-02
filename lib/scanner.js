import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs/promises";
import { formatSize, getErrorMessage, printProgress } from "./utils.js";

const NO_EXTENSION = "(no ext)";
const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_LARGEST = 3;
const MAX_TYPES = 5;

export class Scanner extends EventEmitter {
  async scan(rootPath) {
    const filePaths = await this.getAllFiles(rootPath);
    this.emit("files-collected", { total: filePaths.length });

    const files = [];
    for (const filePath of filePaths) {
      let fileData;

      try {
        fileData = await this.getFileInfo(filePath);
      } catch (error) {
        this.emit("file-skipped", { path: filePath, error });
        continue;
      }

      files.push(fileData);
      this.emit("file-found", fileData);
    }

    const statistics = this.buildStatistics(files);
    this.emit("scan-complete", statistics);
    return statistics;
  }

  async getAllFiles(dirPath) {
    const entries = await fs.readdir(dirPath, {
      withFileTypes: true,
      recursive: true,
    });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name));
  }

  async getFileInfo(filePath) {
    const { size, mtime } = await fs.stat(filePath);

    return {
      path: filePath,
      name: path.basename(filePath),
      extension: path.extname(filePath).toLowerCase() || NO_EXTENSION,
      size,
      mtime,
    };
  }

  buildStatistics(files) {
    const now = Date.now();
    const byExtension = new Map();
    const age = { last7Days: 0, last30Days: 0, olderThan90Days: 0 };
    let totalSize = 0;
    let oldest = null;

    for (const file of files) {
      totalSize += file.size;

      const group = byExtension.get(file.extension) ?? {
        count: 0,
        totalSize: 0,
      };
      group.count++;
      group.totalSize += file.size;
      byExtension.set(file.extension, group);

      const ageDays = (now - file.mtime.getTime()) / DAY_MS;
      if (ageDays <= 7) age.last7Days++;
      if (ageDays <= 30) age.last30Days++;
      if (ageDays > 90) age.olderThan90Days++;

      if (!oldest || file.mtime < oldest.mtime) {
        oldest = { ...file, ageDays: Math.floor(ageDays) };
      }
    }

    const largest = [...files]
      .sort((a, b) => b.size - a.size)
      .slice(0, TOP_LARGEST);

    return {
      totalFiles: files.length,
      totalSize,
      byExtension,
      age,
      largest,
      oldest,
    };
  }
}

export async function scanCommand(targetPath) {
  if (!targetPath) {
    console.error("❌ Не вказано шлях до директорії");
    console.log("Використання: node file-organizer.js scan <шлях>");
    process.exitCode = 1;
    return;
  }

  const root = path.resolve(targetPath);
  console.log(`📂 Scanning: ${root}`);

  const scanner = new Scanner();
  const skipped = [];
  let total = 0;
  let processed = 0;

  function onFileProcessed() {
    processed++;
    printProgress("Processing...", processed, total, " files");
  }

  scanner.on("files-collected", (data) => {
    total = data.total;
  });

  scanner.on("file-found", onFileProcessed);

  scanner.on("file-skipped", (item) => {
    skipped.push(item);
    onFileProcessed();
  });

  scanner.on("scan-complete", (statistics) => {
    printReport(statistics);

    for (const { path: filePath, error } of skipped) {
      console.warn(`⚠️  Пропущено (${getErrorMessage(error)}): ${filePath}`);
    }
  });

  try {
    await scanner.scan(root);
  } catch (error) {
    console.error(`❌ ${getErrorMessage(error)}: ${error.path ?? root}`);
    process.exitCode = 1;
  }
}

function printReport(statistics) {
  console.log("\n\n📊 Scan Results:");
  console.log("━".repeat(30));
  console.log(`Total files: ${statistics.totalFiles}`);
  console.log(`Total size: ${formatSize(statistics.totalSize)}`);

  if (statistics.totalFiles === 0) return;

  printByType(statistics.byExtension);
  printAge(statistics.age);
  printLargest(statistics.largest);

  const { oldest } = statistics;
  console.log(
    `\nOldest file: ${oldest.name} (modified ${oldest.ageDays} days ago)`,
  );
}

function printByType(byExtension) {
  const types = [...byExtension]
    .map(([extension, data]) => ({ extension, ...data }))
    .sort((a, b) => b.totalSize - a.totalSize);

  const rows = types.slice(0, MAX_TYPES);
  const rest = types.slice(MAX_TYPES);

  if (rest.length > 0) {
    rows.push({
      extension: "(other)",
      count: rest.reduce((sum, type) => sum + type.count, 0),
      totalSize: rest.reduce((sum, type) => sum + type.totalSize, 0),
    });
  }

  const labelWidth = Math.max(...rows.map((row) => row.extension.length));
  const countWidth = Math.max(...rows.map((row) => String(row.count).length));
  const sizeWidth = Math.max(
    ...rows.map((row) => formatSize(row.totalSize).length),
  );

  console.log("\nBy File Type:");
  for (const row of rows) {
    const label = row.extension.padEnd(labelWidth);
    const count = String(row.count).padStart(countWidth);
    const size = formatSize(row.totalSize).padStart(sizeWidth);
    console.log(`  ${label} ${count} files   ${size}`);
  }
}

function printAge(age) {
  console.log("\nFile Age:");
  console.log(`  Last 7 days:    ${age.last7Days} files`);
  console.log(`  Last 30 days:   ${age.last30Days} files`);
  console.log(`  Older than 90:  ${age.olderThan90Days} files`);
}

function printLargest(largest) {
  const nameWidth = Math.max(...largest.map((file) => file.name.length));
  const sizeWidth = Math.max(
    ...largest.map((file) => formatSize(file.size).length),
  );

  console.log("\nLargest files:");
  largest.forEach((file, index) => {
    const name = file.name.padEnd(nameWidth);
    const size = formatSize(file.size).padStart(sizeWidth);
    console.log(`  ${index + 1}. ${name}   ${size}`);
  });
}
