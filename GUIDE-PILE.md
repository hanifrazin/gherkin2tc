# PILE – Excel/CSV → Gherkin (Pipe Tables)

> **Target pembaca:** QA Manual yang ingin mengubah data Excel/CSV menjadi `Examples` Gherkin dengan format **pipe tables**.

## Ringkasan
`pile` adalah **wrapper CLI** untuk menjalankan converter `converter/pipe-table.js`.  
Fungsinya: membaca `.xlsx/.csv`, memecah tabel berdasarkan **baris kosong**, lalu menghasilkan file `.feature` berisi **`# Sheet: <name>`** dan beberapa **`Examples:`** (pipe tables).

## Prasyarat
- **Node.js** (disarankan LTS **v22.x** atau sesuai lingkungan Anda)
- File sumber **Excel (.xlsx)** atau **CSV (.csv)**

## Instalasi
Di root proyek:

```bash
npm install
# opsional agar 'pile' bisa dipanggil di terminal
npm link
```

Tanpa `npm link`, jalankan via `node cli/command-pile.js`.

## Cara Kerja Singkat
- Membaca satu atau banyak file `.xlsx/.csv`.
- Untuk setiap **sheet**, data dipecah menjadi **blok/blok** berdasarkan **baris kosong** (opsi `--table-gap`).
- Tiap blok diubah jadi **Examples**:
  - Baris pertama dianggap **header** (kecuali `--no-header`).
  - Bisa **whitelist kolom** (`--columns`), atau **mask** kolom sensitif (`--mask`).
  - Nilai boolean `true/false` di-normalisasi jadi huruf kapital (`TRUE/FALSE`).
  - Karakter `|` diisi data akan di-escape otomatis.

Hasil akhirnya: satu file `.feature` per input, disimpan di folder output default `output-pipe-tables/` dengan nama `<namaFile>_YYYYMMDD_HHmmss.feature`.

## Opsi CLI (`pile`) – *dari* `cli/command-pile.js`
```bash
pile [options]
```

### Pemilihan file input
- **`-i, --input <file...>`**: satu atau lebih file (variadic) `.xlsx`/`.csv`.
- **`-d, --dir <folder>`**: proses semua file di folder (non‑recursive).
- **`-r, --recursive`**: bila dipakai bersama `--dir`, scan folder **rekursif**.

> Setidaknya salah satu dari `-i` atau `-d` harus dipakai. Jika keduanya dipakai, hasilnya digabungkan.

### Filter ekstensi file
- **`--ext <list>`**: daftar ekstensi yang diproses, koma‑separated. Default: `xlsx,csv`.

> File sementara Excel seperti `~$xxxx.xlsx` otomatis **di-skip**.

### Opsi yang diteruskan ke converter `pipe-table.js`
- **`--out-dir <dir>`**: folder output (default: `output-pipe-tables`).
- **`--indent <n>`**: jumlah spasi sebelum tanda `|` (default: `4`).
- **`--columns <cols>`**: whitelist kolom (nama **atau** `#index`), contoh:  
  - `--columns "user,pass"` (berdasarkan header)  
  - `--columns "#0,#3"` (berdasarkan index kolom)
- **`--mask <cols>`**: mask kolom sensitif **berdasarkan header yang sudah terseleksi** (Case‑insensitive). Contoh: `--columns "user,pass" --mask "pass"` → nilai di kolom `pass` menjadi `****`.
- **`--no-header`**: anggap baris pertama **bukan** header.
- **`--table-gap <n>`**: jumlah baris kosong sebagai pemisah tabel (default: `1`).

> CLI `pile` **mengizinkan unknown options** dengan `.allowUnknownOption(true)`, jadi kalau `pipe-table.js` ditambah flag baru nanti, `pile` tidak akan error.

## Opsi Converter (`converter/pipe-table.js`) – *intisari teknis*
- Pemisah blok tabel: fungsi `splitByBlankRows(rows, gap)`.
- Penyusunan Examples: fungsi `toExamples(block, indent, columns, maskSet, noHeader)`:
  - Otomatis menghitung **lebar kolom** agar rapi (`padEnd`).
  - Menangani **header hilang** (`--no-header`) dengan membuat header `c0, c1, ...`.
  - Nilai `"true"/"false"` → `TRUE/FALSE`.
  - Nilai `NaN`/kosong dianggap **empty**, baris kosong akan di-skip.
- Output per file masuk ke: `<out-dir>/<base>_<timestamp>.feature`.

## Contoh Penggunaan (Dasar → Spesifik)

### A. Satu file Excel → satu `.feature`
```bash
pile -i sample_data/login.xlsx
# hasil: output-pipe-tables/login_20250823_160102.feature
```

### B. Banyak file sekaligus (variadic)
```bash
pile -i sample_data/login.xlsx sample_data/register.csv
```

### C. Satu folder (non‑recursive)
```bash
pile -d sample_data
```

### D. Satu folder (recursive) + filter ekstensi
```bash
pile -d sample_data -r --ext xlsx,csv
```

### E. Whitelist kolom dan masking
```bash
pile -i sample_data/users.xlsx --columns "user,pass" --mask "pass"
```

### F. Tanpa header pertama + set indent + table gap
```bash
pile -i sample_data/raw.csv --no-header --indent 2 --table-gap 2
```

## Tips & Best Practice untuk QA
- Gunakan **baris kosong** untuk memisahkan tabel/kelompok data di Excel jika ingin membuat **beberapa `Examples`** sekaligus.
- **Susun header** yang deskriptif; ini memudahkan whitelist & masking.
- Jika ada kolom sensitif (password/token), gunakan `--mask` agar otomatis **disamarkan** menjadi `****`.
- Untuk CSV, pastikan delimiter koma dan tidak ada baris ekstra di bawah agar tidak membuat blok kosong.

## Troubleshooting
- **“Tidak ada file ditemukan”** → pastikan pakai `-i` atau `-d`, dan ekstensi file termasuk dalam `--ext`.
- **Output tidak muncul** → cek folder `output-pipe-tables` dan nama file yang dilengkapi timestamp.
- **Kolom tidak termasking** → ingat bahwa `--mask` bekerja **setelah** seleksi `--columns`. Pastikan nama header sama (case-insensitive) dengan yang Anda masukkan.

## Bantuan
```bash
pile -h
```
Menampilkan semua opsi yang sama dengan dokumentasi ini.
