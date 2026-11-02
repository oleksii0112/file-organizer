import { EventEmitter } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Scanner } from "./scanner.js";
import { formatSize, getErrorMessage, printProgress } from "./utils.js";

const CATEGORIES = {
  Documents: [".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"],
  Images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
  Archives: [".zip", ".rar", ".tar", ".gz", ".7z"],
  Code: [".js", ".py", ".java", ".cpp", ".html", ".css", ".json"],
  Videos: [".mp4", ".avi", ".mkv", ".mov", ".webm"],
  Other: [],
};

const LARGE_FILE_SIZE = 10 * 1024 * 1024;

function getCategory(extension) {
  for (const [category, extensions] of Object.entries(CATEGORIES)) {
    if (extensions.includes(extension)) return category;
  }
  return "Other";
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function getAvailablePath(dirPath, fileName) {
  const { name, ext } = path.parse(fileName);
  let candidate = path.join(dirPath, fileName);
  let counter = 1;

  while (await fileExists(candidate)) {
    candidate = path.join(dirPath, `${name}(${counter})${ext}`);
    counter++;
  }

  return candidate;
}

async function copyFileBySize(sourcePath, targetPath, size) {
  if (size < LARGE_FILE_SIZE) {
    await fs.copyFile(sourcePath, targetPath);
    return;
  }

  try {
    await pipeline(createReadStream(sourcePath), createWriteStream(targetPath));
  } catch (error) {
    await fs.rm(targetPath, { force: true });
    throw error;
  }
}

function isInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

export class Organizer extends EventEmitter {
  async organize(sourcePath, targetPath) {
    const scanner = new Scanner();
    const filePaths = await scanner.getAllFiles(sourcePath);
    this.emit("files-collected", { total: filePaths.length });

    const categories = Object.keys(CATEGORIES);
    for (const category of categories) {
      await fs.mkdir(path.join(targetPath, category), { recursive: true });
    }
    this.emit("folders-created", categories);

    const summary = new Map(categories.map((category) => [category, 0]));
    let copiedFiles = 0;
    let copiedSize = 0;

    for (const filePath of filePaths) {
      let fileData;
      let category;
      let destination;

      try {
        fileData = await scanner.getFileInfo(filePath);
        category = getCategory(fileData.extension);
        this.emit("copy-start", { source: filePath, category });

        destination = await getAvailablePath(
          path.join(targetPath, category),
          fileData.name,
        );
        await copyFileBySize(filePath, destination, fileData.size);
      } catch (error) {
        this.emit("copy-error", { source: filePath, error });
        continue;
      }

      summary.set(category, summary.get(category) + 1);
      copiedFiles++;
      copiedSize += fileData.size;

      this.emit("copy-complete", {
        source: filePath,
        destination,
        category,
        size: fileData.size,
      });
    }

    const result = { summary, copiedFiles, copiedSize };
    this.emit("organize-complete", result);
    return result;
  }
}

export async function organizeCommand(sourceArg, outputArg) {
  if (!sourceArg || !outputArg) {
    console.error("❌ Потрібно вказати вихідну директорію та --output");
    console.log(
      "Використання: node file-organizer.js organize <шлях> --output <шлях>",
    );
    process.exitCode = 1;
    return;
  }

  const source = path.resolve(sourceArg);
  const target = path.resolve(outputArg);

  if (isInside(source, target)) {
    console.error("❌ Цільова директорія не може бути всередині вихідної");
    process.exitCode = 1;
    return;
  }

  console.log(`📦 Organizing: ${source}`);
  console.log(`Target: ${target}`);

  const organizer = new Organizer();
  const failed = [];
  let total = 0;
  let processed = 0;

  function onFileProcessed() {
    processed++;
    printProgress("Copying files...", processed, total);
  }

  organizer.on("files-collected", (data) => {
    total = data.total;
  });

  organizer.on("folders-created", (categories) => {
    console.log("\nCreating folders...");
    for (const category of categories) {
      console.log(`  ✓ ${category}/`);
    }
    console.log();
  });

  organizer.on("copy-complete", onFileProcessed);

  organizer.on("copy-error", (item) => {
    failed.push(item);
    onFileProcessed();
  });

  organizer.on("organize-complete", (result) => {
    printSummary(result, target);

    for (const { source: filePath, error } of failed) {
      console.warn(
        `⚠️  Не скопійовано (${getErrorMessage(error)}): ${filePath}`,
      );
    }
  });

  try {
    await organizer.organize(source, target);
  } catch (error) {
    console.error(`❌ ${getErrorMessage(error)}: ${error.path ?? source}`);
    process.exitCode = 1;
  }
}

function printSummary({ summary, copiedFiles, copiedSize }, target) {
  const targetName = path.basename(target);
  const labelWidth = Math.max(
    ...[...summary.keys()].map((category) => category.length + 1),
  );
  const countWidth = Math.max(
    ...[...summary.values()].map((count) => String(count).length),
  );

  console.log("\n\n✅ Organization complete!\n");
  console.log("Summary:");

  for (const [category, count] of summary) {
    const label = `${category}:`.padEnd(labelWidth);
    const files = String(count).padStart(countWidth);
    console.log(`  ${label} ${files} files → ${targetName}/${category}/`);
  }

  console.log(
    `\nTotal copied: ${copiedFiles} files (${formatSize(copiedSize)})`,
  );
}
