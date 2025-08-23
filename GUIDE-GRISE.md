# GRISE – Gherkin UI → Test Case Excel (Multi‑sheet)

> **Target pembaca:** QA Manual yang baru belajar Automation. Tidak perlu background programming untuk mengikuti panduan ini.

## Ringkasan
`grise` adalah CLI (Command Line Interface) untuk mengonversi file **Gherkin `.feature`** menjadi file **Excel `.xlsx`**.  
- Input bisa **satu file** atau **satu folder** berisi banyak `.feature`.
- Output bisa **satu workbook multi‑sheet** (mode `sheet`) atau **banyak file** (mode `files`).
- Secara default, nama output otomatis memakai **timestamp** agar tidak menimpa file yang ada.

## Prasyarat
- **Node.js** (disarankan LTS **v22.x** atau sesuai lingkungan Anda)
- **Microsoft Excel** (untuk membuka hasil `.xlsx`)
- (Opsional) **Visual Studio Code**

## Instalasi

### 1) Clone / Download proyek
```bash
git clone https://github.com/hanifrazin/gherkin2tc.git
cd gherkin2tc
```

### 2) Install dependencies
```bash
npm install
```

### 3) (Opsional) Pasang CLI ke PATH lokal
Agar perintah `grise` bisa dipanggil langsung di terminal:
```bash
npm link
```
> Tanpa `npm link`, Anda tetap bisa menjalankannya via `node cli/command-grise.js`.

## Struktur Proyek
```
.
├─ cli/
│  ├─ command-grise.js     ← wrapper CLI untuk converter/gherkin-ui.cjs
│  └─ command-pile.js
├─ converter/
│  ├─ gherkin-ui.cjs       ← converter utama Gherkin → Excel
│  └─ pipe-table.js
├─ output/                 ← hasil .xlsx (default)
├─ sample_features/        ← contoh file .feature
├─ package.json
└─ ...
```

## Penggunaan Singkat
```bash
grise -i <input> [-o <output.xlsx>] [--outdir <dir>] [--mode sheet|files] [--overwrite] [--no-timestamp] [-q|--quiet]
```

- **`-i, --input`** (wajib): path ke **file `.feature`** atau **folder** yang berisi `.feature`.
- **`-o, --output`**: path output **file `.xlsx`**.
  - Dipakai untuk **input file** atau **mode `sheet`** (gabung ke satu workbook).
- **`--outdir`**: folder output ketika **mode `files`** (default: `output/`).
- **`--mode`**: ketika input berupa **folder**:
  - `sheet` → gabung semua `.feature` menjadi **satu workbook** (tiap file menjadi **satu sheet**).
  - `files` → hasilkan **banyak `.xlsx`** (satu per `.feature`).
  - default: `sheet`.
- **`--overwrite`**: izinkan menimpa file output (tanpa menambah timestamp).
- **`--no-timestamp`**: nonaktifkan penambahan timestamp otomatis *jika* nama file bentrok.
- **`-q, --quiet`**: minimalkan log.
- **`-h, --help`**: tampilkan bantuan.

> Semua opsi di atas diambil langsung dari file `cli/command-grise.js` sehingga tidak ada opsi yang terlewat.

## Perilaku Default Output
- **Input = file**:
  - tanpa `-o` → `output/<namaFile>-YYYYMMDD_HHmmss.xlsx`
- **Input = folder, `--mode sheet`**:
  - tanpa `-o` → `output/<namaFolder>-YYYYMMDD_HHmmss.xlsx`
- **Input = folder, `--mode files`**:
  - abaikan `-o`, gunakan `--outdir` (default `output/`)
  - tiap `.feature` → `<outdir>/<namaFeature>-YYYYMMDD_HHmmss.xlsx`

> Folder output dibuat otomatis jika belum ada.

## Contoh Perintah (Dasar → Spesifik)

### A. Konversi satu file `.feature`
```bash
grise -i sample_features/login.feature
# hasil: output/login-20250823_153000.xlsx (nama & timestamp ilustrasi)
```

Dengan nama output custom:
```bash
grise -i sample_features/login.feature -o output/login.xlsx
```

Timpa file (tanpa timestamp):
```bash
grise -i sample_features/login.feature -o output/login.xlsx --overwrite --no-timestamp
```

### B. Konversi satu folder → **satu workbook** (multi‑sheet)
```bash
grise -i sample_features --mode sheet -o output/all-features.xlsx
```

Tanpa `-o` (otomatis timestamp):
```bash
grise -i sample_features --mode sheet
```

### C. Konversi satu folder → **banyak file** (satu per feature)
```bash
grise -i sample_features --mode files --outdir output/features
```

Dengan log minimal:
```bash
grise -i sample_features --mode files --outdir output/features -q
```

## Format Excel (yang dihasilkan converter)
> *Bagian ini membantu QA memahami hasil akhir di Excel. Implementasi aktual ada di `converter/gherkin-ui.cjs`.*

- **Sheet**: satu sheet per file `.feature` (ketika mode `sheet`).
- **Kolom** (urutan terbaru, sesuai permintaan Anda):
  - `TC_ID`, `Feature`, `Type`, `Priority`, `Title`, `Precondition (Given)`, `Test Steps (When/And)`, `Test Data`, `Expected Result (Then/And)`, lalu `Tag1..TagN` (opsional, hanya jika ada anotasi lain).
- **Steps**: bernomor & multiline.
- **Test Data**: dari `Examples` (Outline) dalam format bernomor:
  - Mengabaikan key yang **hanya** dipakai di **judul** (mis. `<case>`).
  - Nilai kosong ditampilkan sebagai **`empty (tidak diisi)`**.
- **Priority / Type**: dari tag:
  - Priority: `@P0..@P3` (atau alias seperti `@critical/@high/@medium/@low`).
  - Type: `@positive` / `@negative` → `Positive` / `Negative`.
- **Tag1..TagN**: semua anotasi **lainnya** selain Priority/Type (contoh: `@happy @smoke @belanja`), ditampilkan Capitalized.

> Catatan: baris `@...` setelah `Background:` juga didukung (sudah dipatch supaya tidak “termakan” parser Background).

## Troubleshooting (ringkas)
- **Tidak muncul kolom `Tag1..TagN`** → Pastikan `Tags` di row adalah string mentah `@...` yang dipisah spasi. (Sudah diperbaiki di wrapper; writer juga mengekstrak tag dengan regex kebal koma).
- **Output tertimpa** → gunakan timestamp default, atau tambahkan `--no-timestamp --overwrite` jika memang ingin menimpa.
- **Tidak ada sheet** → pastikan folder berisi `.feature` saja (file lain diabaikan).

## Bantuan
```bash
grise -h
```
Menampilkan ringkasan opsi yang sama dengan dokumentasi ini.
