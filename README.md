# 🗂️ File Organizer

CLI-застосунок на Node.js для наведення ладу в директорії (наприклад, у Downloads): аналізує вміст, знаходить дублікати за SHA-256, розкладає файли по категоріях і видаляє застарілі файли з попереднім переглядом (dry run).

## Можливості

- **`scan`** — статистика: кількість і розмір файлів, типи, вік, найбільші та найстаріший файл
- **`duplicates`** — пошук файлів з однаковим вмістом через SHA-256 і підрахунок зайвого місця
- **`organize`** — копіювання файлів у папки Documents / Images / Archives / Code / Videos / Other
- **`cleanup`** — пошук і видалення файлів, старших за N днів, з режимом dry run

## Вимоги

- Node.js **20.12** або новіший (використовуються `fs.readdir({ recursive: true })` і `Dirent.parentPath`)
- Сторонніх залежностей для роботи немає

## Встановлення

```bash
git clone https://github.com/oleksii0112/file-organizer.git
cd file-organizer
npm install
```

`npm install` встановлює лише `nodemon` для розробки.

## Швидкий старт

```bash
node file-organizer.js scan ~/Downloads
node file-organizer.js duplicates ~/Downloads
node file-organizer.js organize ~/Downloads --output ~/Organized
node file-organizer.js cleanup ~/Downloads --older-than 90
```

Те саме через npm-скрипти:

```bash
npm run scan -- ~/Downloads
npm run duplicates -- ~/Downloads
npm run organize -- ~/Downloads --output ~/Organized
npm run cleanup -- ~/Downloads --older-than 90 --confirm
```

> `--` після назви скрипту обов'язковий: усе, що йде після нього, npm передає в програму. Без нього npm сприйме `--output`, `--older-than` і `--confirm` як власні опції.

> **Windows (Git Bash):** беріть шляхи в лапки або пишіть через `/`: `"D:\Downloads"`, `D:/Downloads` чи `/d/Downloads`. Без лапок bash видаляє символ `\`.

---

## Команди

### `scan` — аналіз директорії

```
node file-organizer.js scan <директорія>
```

| Аргумент | Опис |
|---|---|
| `<директорія>` | Папка для аналізу, обходиться рекурсивно |

Що показує:

- загальну кількість і розмір файлів;
- розподіл за типами: 5 найбільших за обсягом, решта згорнута в `(other)`;
- вік файлів: змінені за останні 7 і 30 днів, старші за 90 днів;
- 3 найбільші файли та найстаріший файл.

```
📂 Scanning: /home/user/Downloads
Processing... ████████████████████ 17/17 files

📊 Scan Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total files: 17
Total size: 705 MB

By File Type:
  .mp4    1 files   450 MB
  .zip    1 files   156 MB
  .pptx   1 files    89 MB
  .pdf    5 files   9.0 MB
  .png    2 files   1.2 MB
  (other) 7 files     19 B

File Age:
  Last 7 days:    13 files
  Last 30 days:   14 files
  Older than 90:  2 files

Largest files:
  1. video_lecture.mp4    450 MB
  2. archive_backup.zip   156 MB
  3. presentation.pptx     89 MB

Oldest file: old_report.pdf (modified 365 days ago)
```

### `duplicates` — пошук дублікатів

```
node file-organizer.js duplicates <директорія>
```

| Аргумент | Опис |
|---|---|
| `<директорія>` | Папка для пошуку, обходиться рекурсивно |

Як працює:

- для кожного файлу обчислюється хеш SHA-256 (`crypto.createHash`);
- файл читається потоком (`fs.createReadStream`) порціями по 64 KB, тож навіть файли на кілька гігабайтів не завантажуються в пам'ять цілком;
- файли з однаковим хешем мають ідентичний вміст і групуються, показуються лише групи з двох і більше файлів;
- зайве місце = розмір файлу × (кількість копій − 1);
- порожні файли ігноруються.

```
🔍 Searching for duplicates in: /home/user/Downloads
Calculating hashes... ████████████████████ 12/12 files

Found 3 duplicate groups (8.3 MB wasted):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group 1 (3 copies, 3.2 MB each):
  SHA-256: d1025d4556f6...

  📄 Downloads/lecture.pdf
  📄 Downloads/lecture(1).pdf
  📄 Downloads/backup/lecture_copy.pdf

  Wasted space: 6.4 MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group 2 (2 copies, 1.5 MB each):
  SHA-256: 3c11029708e7...

  📄 Downloads/image.png
  📄 Downloads/screenshots/image(1).png

  Wasted space: 1.5 MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 Total wasted space: 8.3 MB
```

### `organize` — сортування по категоріях

```
node file-organizer.js organize <джерело> --output <ціль>
```

| Аргумент | Опис |
|---|---|
| `<джерело>` | Папка, з якої копіюються файли, обходиться рекурсивно |
| `--output <ціль>` | Обов'язковий. Папка, куди розкладаються копії, створюється автоматично |

Категорії:

| Категорія | Розширення |
|---|---|
| Documents | `.pdf` `.docx` `.doc` `.txt` `.md` `.xlsx` `.pptx` |
| Images | `.png` `.jpg` `.jpeg` `.gif` `.svg` `.webp` `.bmp` |
| Archives | `.zip` `.rar` `.tar` `.gz` `.7z` |
| Code | `.js` `.py` `.java` `.cpp` `.html` `.css` `.json` |
| Videos | `.mp4` `.avi` `.mkv` `.mov` `.webm` |
| Other | усе інше, зокрема файли без розширення |

Особливості:

- **Оригінали лишаються на місці**: команда лише копіює, нічого не видаляючи.
- Регістр розширення не важливий: `photo.JPG` потрапить в Images.
- Файли менші за 10 MB копіюються через `fs.copyFile`, файли від 10 MB — потоком через `stream.pipeline`.
- **Конфлікт назв:** наявний файл не перезаписується, а копія отримує суфікс `report.pdf` → `report(1).pdf` → `report(2).pdf`.
- Цільова папка не може бути всередині вихідної: інакше повторний запуск копіював би результати самі в себе.

```
📦 Organizing: /home/user/Downloads
Target: /home/user/Organized

Creating folders...
  ✓ Documents/
  ✓ Images/
  ✓ Archives/
  ✓ Code/
  ✓ Videos/
  ✓ Other/

Copying files... ████████████████████ 15/15

✅ Organization complete!

Summary:
  Documents: 5 files → Organized/Documents/
  Images:    2 files → Organized/Images/
  Archives:  2 files → Organized/Archives/
  Code:      2 files → Organized/Code/
  Videos:    2 files → Organized/Videos/
  Other:     2 files → Organized/Other/

Total copied: 15 files (45 MB)
```

### `cleanup` — видалення старих файлів

```
node file-organizer.js cleanup <директорія> --older-than <днів> [--confirm]
```

| Аргумент | Опис |
|---|---|
| `<директорія>` | Папка для очищення, обходиться рекурсивно |
| `--older-than <днів>` | Обов'язковий. Ціле число більше 0: файли, змінені більше ніж N днів тому |
| `--confirm` | Необов'язковий. Без нього працює dry run (лише список), з ним файли реально видаляються |

Особливості:

- вік визначається за датою останньої зміни (`mtime`);
- **без `--confirm` нічого не видаляється**, команда лише показує, що буде видалено;
- у списку 10 найстаріших файлів, решта згорнута в `... (N more files)`;
- корінь диска (`C:\`, `/`) як директорія не приймається;
- файли, які не вдалося видалити (відкриті в іншій програмі, без прав доступу), виводяться окремим списком, а видалення решти триває.

> ⚠️ Видалення незворотне: файли не потрапляють у Кошик. Спершу запускайте команду без `--confirm`.

Dry run:

```
🧹 Cleanup: /home/user/Downloads
Looking for files older than 90 days...

Found 3 files to delete:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
screenshots/ancient_screenshot.png
  Size: 781 KB
  Modified: 365 days ago (2025-11-02)

backup_2023.zip
  Size: 45 MB
  Modified: 180 days ago (2026-05-06)

old_report.pdf
  Size: 2.3 MB
  Modified: 120 days ago (2026-07-05)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total: 3 files (48 MB)

⚠️  DRY RUN MODE: No files were deleted.
To actually delete these files, run with --confirm flag.
```

З `--confirm`:

```
...
Total: 3 files (48 MB)

⚠️  DELETING 3 files (48 MB). This action cannot be undone!

Deleting... ████████████████████ 3/3

✅ Cleanup complete!
Deleted: 3 files (48 MB freed)
```

---

## Обробка помилок

Усі файлові операції обгорнуті в `try...catch`, а коди помилок Node.js перетворюються на зрозумілі повідомлення:

| Код | Повідомлення |
|---|---|
| `ENOENT` | Файл або директорію не знайдено |
| `ENOTDIR` | Це файл, не директорія |
| `EACCES` | Немає прав доступу |
| `EPERM` | Операцію заборонено системою |
| `EBUSY` | Файл зайнятий іншим процесом |

- Помилка на вказаній директорії (папки немає, немає доступу, передано файл) зупиняє команду з кодом виходу `1`.
- Помилка на окремому файлі роботу не зупиняє: файл пропускається, а в кінці виводиться список пропущених.

```
❌ Файл або директорію не знайдено: /home/user/Downlaods
```

## Архітектура

Кожна команда — це клас, що наслідується від `EventEmitter`. Клас лише виконує роботу й генерує події, а вивід у консоль і прогрес-бар робить функція команди, яка на ці події підписується. Тому класи можна використати й поза CLI, наприклад у GUI чи на сервері.

| Клас | Файл | Події |
|---|---|---|
| `Scanner` | `lib/scanner.js` | `files-collected`, `file-found`, `file-skipped`, `scan-complete` |
| `DuplicateFinder` | `lib/duplicates.js` | `files-collected`, `file-processed`, `file-skipped`, `duplicates-found` |
| `Organizer` | `lib/organizer.js` | `files-collected`, `folders-created`, `copy-start`, `copy-complete`, `copy-error`, `organize-complete` |
| `Cleanup` | `lib/cleanup.js` | `file-found`, `file-skipped`, `search-complete`, `file-deleted`, `delete-error`, `cleanup-complete` |

`DuplicateFinder`, `Organizer` і `Cleanup` обходять директорію через `Scanner.getAllFiles()` і `Scanner.getFileInfo()`, тому логіка обходу не дублюється.

## Структура проєкту

```
file-organizer/
├── package.json        # конфігурація, "type": "module", npm-скрипти
├── .gitignore
├── README.md
├── file-organizer.js   # точка входу: розбір process.argv і виклик команди
└── lib/
    ├── scanner.js      # клас Scanner + команда scan
    ├── duplicates.js   # клас DuplicateFinder + команда duplicates
    ├── organizer.js    # клас Organizer + команда organize
    ├── cleanup.js      # клас Cleanup + команда cleanup
    └── utils.js        # formatSize, прогрес-бар, повідомлення про помилки
```

## Розробка

```bash
npm run dev -- scan ./lib
```

`nodemon` перезапускає команду після кожного збереження коду.

> Не запускайте через `dev` команду `organize` з цільовою папкою всередині проєкту: кожен скопійований `.js` чи `.json` перезапускатиме nodemon, і копіювання піде по колу.# file-organizer
