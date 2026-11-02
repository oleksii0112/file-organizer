import { scanCommand } from "./lib/scanner.js";
import { duplicatesCommand } from "./lib/duplicates.js";
import { organizeCommand } from "./lib/organizer.js";
import { cleanupCommand } from "./lib/cleanup.js";

const USAGE = `Використання:
  node file-organizer.js scan <шлях>
  node file-organizer.js duplicates <шлях>
  node file-organizer.js organize <шлях> --output <шлях>
  node file-organizer.js cleanup <шлях> --older-than <днів> [--confirm]`;

const [command, targetPath, ...options] = process.argv.slice(2);

function getOptionValue(name) {
  const index = options.indexOf(name);
  return index === -1 ? undefined : options[index + 1];
}

function hasFlag(name) {
  return options.includes(name);
}

switch (command) {
  case "scan":
    await scanCommand(targetPath);
    break;

  case "duplicates":
    await duplicatesCommand(targetPath);
    break;

  case "organize":
    await organizeCommand(targetPath, getOptionValue("--output"));
    break;

  case "cleanup":
    await cleanupCommand(
      targetPath,
      getOptionValue("--older-than"),
      hasFlag("--confirm"),
    );
    break;

  default:
    if (command) console.error(`❌ Невідома команда: ${command}\n`);
    console.log(USAGE);
    process.exitCode = 1;
}
