import crypto from "crypto";
import fs from "fs";
import { EventEmitter } from "node:events";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Scanner } from "./scanner.js";
import { formatSize, getErrorMessage, printProgress } from "./utils.js";

const HASH_PREVIEW_LENGTH = 12;

function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export class DuplicateFinder extends EventEmitter {
  async find(rootPath) {
    const scanner = new Scanner();
    const filePaths = await scanner.getAllFiles(rootPath);
    this.emit("files-collected", { total: filePaths.length });

    const hashGroups = new Map();

    for (const filePath of filePaths) {
      let fileData;
      let hash;

      try {
        fileData = await scanner.getFileInfo(filePath);
        hash = await calculateHash(filePath);
      } catch (error) {
        this.emit("file-skipped", { path: filePath, error });
        continue;
      }

      const group = hashGroups.get(hash) ?? { size: fileData.size, paths: [] };
      group.paths.push(filePath);
      hashGroups.set(hash, group);

      this.emit("file-processed", { path: filePath, hash });
    }

    const duplicates = this.buildDuplicateGroups(hashGroups);
    this.emit("duplicates-found", duplicates);
    return duplicates;
  }

  buildDuplicateGroups(hashGroups) {
    const groups = [];

    for (const [hash, group] of hashGroups) {
      if (group.paths.length > 1 && group.size > 0) {
        groups.push({
          hash,
          size: group.size,
          paths: group.paths,
          wastedSpace: group.size * (group.paths.length - 1),
        });
      }
    }

    groups.sort((a, b) => b.wastedSpace - a.wastedSpace);
    const totalWasted = groups.reduce(
      (sum, group) => sum + group.wastedSpace,
      0,
    );

    return { groups, totalWasted };
  }
}

export async function duplicatesCommand(targetPath) {
  if (!targetPath) {
    console.error("❌ Не вказано шлях до директорії");
    console.log("Використання: node file-organizer.js duplicates <шлях>");
    process.exitCode = 1;
    return;
  }

  const root = path.resolve(targetPath);
  console.log(`🔍 Searching for duplicates in: ${root}`);

  const finder = new DuplicateFinder();
  const skipped = [];
  let total = 0;
  let processed = 0;

  function onFileProcessed() {
    processed++;
    printProgress("Calculating hashes...", processed, total, " files");
  }

  finder.on("files-collected", (data) => {
    total = data.total;
  });

  finder.on("file-processed", onFileProcessed);

  finder.on("file-skipped", (item) => {
    skipped.push(item);
    onFileProcessed();
  });

  finder.on("duplicates-found", (result) => {
    printDuplicates(result, root);

    for (const { path: filePath, error } of skipped) {
      console.warn(`⚠️  Пропущено (${getErrorMessage(error)}): ${filePath}`);
    }
  });

  try {
    await finder.find(root);
  } catch (error) {
    console.error(`❌ ${getErrorMessage(error)}: ${error.path ?? root}`);
    process.exitCode = 1;
  }
}

function printDuplicates({ groups, totalWasted }, root) {
  if (groups.length === 0) {
    console.log("\n\n✅ No duplicates found.");
    return;
  }

  const divider = "━".repeat(34);
  const displayBase = path.dirname(root);

  console.log(
    `\n\nFound ${groups.length} duplicate groups (${formatSize(totalWasted)} wasted):\n`,
  );

  groups.forEach((group, index) => {
    console.log(divider);
    console.log(
      `Group ${index + 1} (${group.paths.length} copies, ${formatSize(group.size)} each):`,
    );
    console.log(`  SHA-256: ${group.hash.slice(0, HASH_PREVIEW_LENGTH)}...\n`);

    for (const filePath of group.paths) {
      console.log(`  📄 ${path.relative(displayBase, filePath)}`);
    }

    console.log(`\n  Wasted space: ${formatSize(group.wastedSpace)}\n`);
  });

  console.log(divider);
  console.log(`💾 Total wasted space: ${formatSize(totalWasted)}`);
}