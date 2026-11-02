const ERROR_MESSAGES = {
  ENOENT: "Файл або директорію не знайдено",
  ENOTDIR: "Це файл, не директорія",
  EACCES: "Немає прав доступу",
  EPERM: "Операцію заборонено системою",
  EBUSY: "Файл зайнятий іншим процесом",
};

const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function getErrorMessage(error) {
  return ERROR_MESSAGES[error.code] ?? error.message;
}

export function formatSize(bytes) {
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const value =
    unitIndex === 0 || size >= 10 ? Math.round(size) : size.toFixed(1);
  return `${value} ${SIZE_UNITS[unitIndex]}`;
}

export function drawProgressBar(current, total, width = 20) {
  const percentage = total === 0 ? 1 : current / total;
  const filled = Math.round(percentage * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `${bar} ${current}/${total}`;
}

export function printProgress(label, current, total, suffix = "") {
  const step = Math.max(1, Math.floor(total / 100));
  if (current % step !== 0 && current !== total) return;

  process.stdout.write(
    `\r${label} ${drawProgressBar(current, total)}${suffix}`,
  );
}
