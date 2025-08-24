# GUIDE - Download Google Sheet ke Excel (.xlsx)

Dokumen ini adalah panduan resmi penggunaan **download-sheet.cjs**, sebuah CLI Node.js yang memungkinkan Anda mengunduh data dari Google Apps Script Web App (yang mengekspor Google Sheets) langsung ke file **Excel (.xlsx)** di komputer lokal.

---

## 📦 Persiapan & Instalasi

1. **Instal Node.js**  
   Pastikan Node.js sudah terpasang di komputer Anda. Cek dengan:
   ```bash
   node -v
   ```
   Disarankan menggunakan versi 14 ke atas.

2. **Clone / Download Project**  
   Pastikan file `download-sheet.cjs` sudah ada di dalam folder project Anda.

3. **Install dependency**  
   Jalankan sekali saja di root project:
   ```bash
   npm i exceljs
   ```

4. **Siapkan credential lokal**  
   Buat file baru bernama `credentials.local.json` di root project (atau di folder lain sesuai kebutuhan).  
   Contoh isi:

   ```json
   {
     "webAppUrl": "https://script.google.com/macros/s/AKfycbxEXAMPLE/exec",
     "token": "ISI_TOKEN_RAHASIA_ANDA",
     "defaultSheetName": "NAMA_SHEET_ANDA",
     "method": "GET",
     "outDir": "./output",
     "autoName": true,
     "filenamePrefix": "",
     "filenameSuffix": "",
     "renameSheetTo": null
   }
   ```

   Keterangan setiap field:
   - **webAppUrl** : URL Web App dari Google Apps Script Anda (`/exec`).
   - **token** : Token rahasia yang sudah diset di Script Properties Apps Script.
   - **defaultSheetName** : Nama sheet default jika tidak ditentukan via CLI.
   - **method** : HTTP method (GET atau POST).
   - **outDir** : Folder output default tempat menyimpan file Excel.
   - **autoName** : Jika `true`, nama file otomatis mengikuti nama sheet.
   - **filenamePrefix** : Prefix tambahan pada nama file (opsional).
   - **filenameSuffix** : Suffix tambahan pada nama file (opsional).
   - **renameSheetTo** : Nama tab di file Excel (opsional, default sama dengan nama sheet).

   👉 Jangan lupa tambahkan `credentials.local.json` ke `.gitignore` agar tidak ikut ke GitHub.

---

## ▶️ Cara Menjalankan

Jalankan dengan perintah:

```bash
node download-sheet.cjs [opsi]
```

---

## ⚙️ Daftar Opsi CLI

| Opsi | Keterangan | Contoh |
|------|------------|--------|
| `--cred <path>` | Path ke file credential JSON lokal. | `--cred ./credentials.local.json` |
| `--url <webapp_url>` | Override Web App URL dari credential. | `--url "https://script.google.com/macros/s/.../exec"` |
| `--token <secret>` | Override token dari credential. | `--token "abc123"` |
| `--method GET|POST` | Pilih metode request. Default `GET`. | `--method POST` |
| `--sheet <name>` | Nama sheet sumber (juga dipakai untuk nama file output). | `--sheet "Sheet2"` |
| `--rename-sheet <name>` | Rename judul tab di Excel (tidak mengubah nama file). | `--rename-sheet "Billing-Aug"` |
| `--out <file.xlsx>` | Path output final, menimpa auto naming. | `--out "./data/MyFile.xlsx"` |
| `--out-dir <dir>` | Folder output default. | `--out-dir "./data-test"` |
| `--prefix <txt>` | Prefix untuk nama file. | `--prefix "TC-"` |
| `--suffix <txt>` | Suffix untuk nama file. | `--suffix "-QA"` |
| `--auto-name` | Paksa nama file otomatis `<prefix><sheet><suffix>.xlsx`. | `--auto-name` |
| `--timeout <ms>` | Timeout request (ms). Default `30000`. | `--timeout 60000` |

---

## 📚 Contoh Penggunaan

### 1. Jalankan dengan credential file (paling ringkas)
```bash
node download-sheet.cjs --cred ./credentials.local.json
```
Output: `./output/NAMA_SHEET_ANDA.xlsx`

---

### 2. Ambil sheet lain (nama file ikut berubah)
```bash
node download-sheet.cjs --cred ./credentials.local.json --sheet "Sheet2"
```
Output: `./output/Sheet2.xlsx`

---

### 3. Override path output (absolute path)
```bash
node download-sheet.cjs --cred ./credentials.local.json   --out "/Users/user/Desktop/gherkin2tc/data-test/Product-Biller.xlsx"
```

---

### 4. Custom folder + prefix + suffix
```bash
node download-sheet.cjs --cred ./credentials.local.json   --sheet "Product-Biller"   --out-dir "/Users/user/Desktop/gherkin2tc/data-test"   --prefix "TC-"   --suffix "-QA"
```
Output: `/Users/user/Desktop/gherkin2tc/data-test/TC-Product-Biller-QA.xlsx`

---

### 5. Rename judul tab di workbook Excel
```bash
node download-sheet.cjs --cred ./credentials.local.json   --sheet "Sheet2"   --rename-sheet "Billing-Aug"
```
Output file: `./output/Sheet2.xlsx`  
Judul tab di Excel: `Billing-Aug`

---

### 6. Override URL & Token langsung dari CLI
```bash
node download-sheet.cjs   --url "https://script.google.com/macros/s/AKfycbxEXAMPLE/exec"   --token "MYTOKEN123"   --sheet "Product-Biller"
```

---

## ✅ Ringkasan

Dengan `download-sheet.cjs`, QA maupun engineer bisa dengan mudah mengekspor data Google Sheets ke file Excel lokal hanya dengan sekali perintah. Semua opsi CLI mendukung fleksibilitas penuh untuk mengatur nama file, lokasi output, prefix/suffix, hingga rename tab di Excel.

