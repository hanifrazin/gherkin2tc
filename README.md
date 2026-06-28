# Gherkin2TC — CLI Tools untuk QA/Engineer

Repositori ini berisi kumpulan **CLI tools** untuk mengonversi file Gherkin (`.feature`) ke Excel test case dan sebaliknya.

---

## 🚀 Panduan Awal (Setelah Clone)

Ikuti langkah-langkah berikut **secara berurutan**:

### 1. Clone repositori

```bash
git clone https://github.com/hanifrazin/gherkin2tc.git
cd gherkin2tc
```

### 2. Install dependencies

```bash
npm install
```

### 3. Link CLI ke PATH global ⚠️ **WAJIB**

Agar perintah `grise`, `pile`, `pandkin`, `grapite` bisa dipanggil langsung dari terminal:

```bash
npm link
```

> **⚠️ Tanpa `npm link`, perintah seperti `grise` akan error: `zsh: command not found: grise`**
>
> Alternatif tanpa `npm link` — gunakan path lengkap:
> ```bash
> node src/cli/command-grise.js -i samples/features/login.feature
> node src/cli/command-pile.js --help
> node src/cli/command-pandkin.js -i samples/features/login.feature
> node src/cli/command-grapite.js --help
> ```

### 4. Verifikasi instalasi

Coba jalankan salah satu CLI:

```bash
grise --help
```

Jika muncul bantuan penggunaan, berarti instalasi berhasil ✅

### 5. (Opsional) Buat credentials

Hanya diperlukan jika ingin menggunakan **Download-Sheet** atau **Flow**:

```bash
# Buat file credentials (isi sesuai panduan)
touch credentials.local.json
# 👉 Buka docs/GUIDE-DOWNLOAD-SHEET.md untuk format isinya
```

> **Jangan commit** `credentials*.json` ke GitHub (sudah di `.gitignore`).

---

## 🧰 Daftar Tools

| CLI | Perintah | Fungsi |
|-----|----------|--------|
| **GRISE** | `grise` | Gherkin `.feature` → Excel test case (.xlsx) |
| **PILE** | `pile` | Excel/CSV → Gherkin pipe tables (`.feature`) |
| **PANDKIN** | `pandkin` | Expand Gherkin Scenario Outline → Scenarios |
| **GRAPITE** | `grapite` | Gherkin API → Excel (.xlsx) |
| **Download-Sheet** | `node scripts/download-sheet.cjs` | Download Google Sheet → Excel (.xlsx) |
| **Flow** | `node scripts/flow.cjs` | Orchestrator: download sheet + pile |

---

### 🔹 GRISE — Gherkin UI → Test Case Excel

Konversi file `.feature` ke Excel dengan kolom: TC_ID, Feature, Type, Priority, Title, Steps, Test Data, Expected Result, Tags.

```bash
grise -i samples/features/login.feature
# Output: outputs/testcase/login-20260628.xlsx
```

| Opsi | Fungsi |
|------|--------|
| `-i, --input` | File `.feature` atau folder |
| `-o, --output` | Nama file `.xlsx` (default: `outputs/testcase/`) |
| `--mode sheet\|files` | `sheet` = gabung, `files` = pisah per file |
| `-v` | Tampilkan log detail |

📖 [Buka Panduan Lengkap →](./docs/GUIDE-GRISE.md)

---

### 🔹 PILE — Excel/CSV → Gherkin (Pipe Tables)

Konversi file Excel/CSV menjadi pipe tables dalam format Gherkin `.feature`.

```bash
pile -i samples/data/login.xlsx
# Output: outputs/piles/login_20260628_110102.feature
```

📖 [Buka Panduan Lengkap →](./docs/GUIDE-PILE.md)

---

### 🔹 PANDKIN — Expand Gherkin Scenario Outline

Memperluas (expand) `Scenario Outline` + `Examples` menjadi `Scenario` individual.

```bash
pandkin -i samples/features/login.feature
# Output: outputs/gherkin-expand/login-expand.feature

cat input.feature | pandkin          # via pipe (stdin)
pandkin -i a.feature,b.feature        # multiple files
```

**Fitur:**
- Expand `Scenario Outline` dengan `Examples` menjadi N `Scenario`
- Mempertahankan `Background` (termasuk multiple Background)
- Support input via pipe (stdin)
- Output per file dengan suffix `-expand.feature`

---

### 🔹 GRAPITE — Gherkin API → Excel

Konversi file Gherkin `.feature` untuk API testing ke format Excel.

```bash
grapite -i samples/features/api-sample.feature
# Output: outputs/testcase-api/api-testcases.xlsx
```

Kolom: TC_ID, Priority, Type, Rule, Title, Method, Endpoint, Preconditions, Headers, Body Params, Steps, Expected Status, Assertions, Test Data.

---

### 🔹 Download-Sheet — Google Sheet → Excel

Download data dari Google Apps Script Web App ke file `.xlsx`.

```bash
node scripts/download-sheet.cjs --cred ./credentials.local.json
```

📖 [Buka Panduan Lengkap →](./docs/GUIDE-DOWNLOAD-SHEET.md)

---

### 🔹 Flow — Orchestrator (Download + PILE)

Menjalankan 2 langkah berurutan: (1) download sheet, (2) konversi dengan PILE.

```bash
node scripts/flow.cjs -- "Nama Sheet"
npm run flow -- "Nama Sheet"
```

**Output:** `outputs/flow-data/<NamaSheet>.xlsx` → `outputs/piles/<NamaSheet>_<timestamp>.feature`

---

## 📚 Referensi Lainnya

- [Tutorial Gherkin v6](./docs/Tutorial_Gherkin_v6.md) — Panduan syntax Gherkin v6 untuk pemula
- [Panduan Gherkin → Test Case dengan Mapping Tabel](./docs/panduan-gherkin-QA-with-mapping.md) — Studi kasus lengkap Gherkin + mapping ke tabel test case

---

## 📁 Struktur & Fungsi Setiap Folder

```
.
├── src/
│   ├── cli/                       # [KODE] CLI wrappers — entry point user
│   │   ├── command-grise.js       #   GRISE — Gherkin → Excel (UI test case)
│   │   ├── command-pile.js        #   PILE — Excel/CSV → Gherkin pipe tables
│   │   ├── command-pandkin.js     #   PANDKIN — Expand Scenario Outline
│   │   ├── command-grapite.js     #   GRAPITE — API Gherkin → Excel
│   │   └── colorize.cjs           #   Color utility untuk output terminal
│   │
│   └── converter/                 # [KODE] Core engines — logic konversi
│       ├── gherkin-ui.cjs         #   GRISE converter (parser + Excel writer)
│       ├── gherkin-api.cjs        #   GRAPITE converter (API-specific)
│       ├── gherkin-outline-expander.cjs  # PANDKIN engine
│       └── pipe-table.js          #   PILE engine
│
├── scripts/                       # [KODE] Utility scripts (non-bin)
│   ├── download-sheet.cjs         #   Download Google Sheet → Excel
│   └── flow.cjs                   #   Orchestrator download + pile
│
├── samples/
│   ├── features/                  # [INPUT] Contoh file .feature untuk testing
│   └── data/                      # [INPUT] Contoh file .xlsx/.csv
│
├── docs/                          # [DOKUMENTASI] Panduan lengkap
│   ├── GUIDE-GRISE.md             #   Panduan GRISE
│   ├── GUIDE-PILE.md              #   Panduan PILE
│   ├── GUIDE-DOWNLOAD-SHEET.md    #   Panduan Download-Sheet
│   ├── Tutorial_Gherkin_v6.md     #   Tutorial Gherkin v6
│   └── panduan-gherkin-QA-with-mapping.md  # Mapping Gherkin → Test Case
│
├── outputs/                       # [OUTPUT] Generated files (gitignored)
│   ├── testcase/                  #   Output dari GRISE (.xlsx)
│   ├── gherkin-expand/            #   Output dari PANDKIN (.feature)
│   ├── piles/                     #   Output dari PILE (.feature)
│   ├── testcase-api/              #   Output dari GRAPITE (.xlsx)
│   └── flow-data/                 #   Output sementara dari Flow (.xlsx)
│
├── README.md                      # [ROOT] Dokumentasi utama (file ini)
├── package.json                   # [ROOT] Konfigurasi npm & dependencies
├── .editorconfig                  # [ROOT] Standar format editor
└── .gitignore                     # [ROOT] File yang diabaikan git
```

---

## ✅ Hasil Test

Semua CLI sudah diuji dengan struktur baru ini:

| CLI | Perintah | Output | Status |
|-----|----------|--------|--------|
| **GRISE** | `grise -i samples/features/login.feature` | `outputs/testcase/login-20260628.xlsx` | ✅ |
| **GRISE** (tanpa arg) | `grise` | Tampil help | ✅ |
| **PILE** | `pile --help` | Tampil help | ✅ |
| **PANDKIN** | `pandkin -i samples/features/login.feature` | `outputs/gherkin-expand/login-expand.feature` | ✅ |
| **PANDKIN** (stdin) | `echo 'Feature: test' \| pandkin` | Output file | ✅ |
| **PANDKIN** (tanpa arg) | `pandkin` | Tampil help (TTY detect) | ✅ |
| **GRAPITE** | `grapite -i samples/features/api-sample.feature -o test-api.xlsx` | `outputs/testcase-api/test-api.xlsx` | ✅ |

---

## 📌 Catatan Penting

- **`npm link` wajib** jika ingin panggil `grise`, `pile`, `pandkin`, `grapite` langsung. Tanpa itu, jalankan via `node src/cli/command-*.js`.
- **Credentials** (`credentials*.json`) jangan di-commit — sudah di `.gitignore`.
- Semua hasil konversi otomatis masuk ke folder `outputs/` dan tidak ter-track git.
- Untuk detail parameter dan contoh penggunaan, buka file panduan di [`docs/`](./docs/).
