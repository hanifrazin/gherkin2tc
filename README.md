# gherkin2tc

> Toolkit sederhana untuk QA Manual → membantu konversi **Gherkin <-> Excel** tanpa perlu coding.

## 📦 Fitur Utama

### 1. GRISE (Gherkin → Excel Test Case)
CLI untuk mengonversi file `.feature` menjadi `.xlsx`:
- Input: satu file atau satu folder berisi `.feature`.
- Output: satu file Excel multi-sheet atau banyak file Excel.
- Kolom hasil sudah diformat sesuai kebutuhan QA:
  - `TC_ID`, `Feature`, `Type`, `Priority`, `Title`, `Precondition (Given)`, `Test Steps (When/And)`, `Test Data`, `Expected Result (Then/And)`, `Tag1..TagN` (opsional).
- Mendukung:
  - Scenario & Scenario Outline.
  - Background.
  - Tag Priority (`@P0..@P3`), Type (`@positive/@negative`), dan anotasi lain.
  - Format Test Data otomatis bernomor, skip placeholder dari title, isi kosong jadi `"empty (tidak diisi)"`.

👉 **Baca panduan lengkap:** [GUIDE-GRISE.md](./GUIDE-GRISE.md)

---

### 2. PILE (Excel/CSV → Gherkin Pipe Tables)
CLI untuk mengonversi `.xlsx`/`.csv` menjadi `.feature`:
- Membaca sheet dan memecah data berdasarkan baris kosong.
- Output: pipe table `Examples` rapi dengan auto-align.
- Opsi tambahan:
  - Whitelist kolom (`--columns`).
  - Mask kolom sensitif (`--mask`).
  - Non-header mode (`--no-header`).
  - Table gap (`--table-gap`).
- Berguna untuk membuat `Examples:` cepat dari data Excel/CSV.

👉 **Baca panduan lengkap:** [GUIDE-PILE.md](./GUIDE-PILE.md)

---

## 🚀 Instalasi

Clone repo dan install dependencies:
```bash
git clone https://github.com/hanifrazin/gherkin2tc.git
cd gherkin2tc
npm install
