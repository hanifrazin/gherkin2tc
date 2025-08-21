# Panduan Praktis: Gherkin → Test Case (dengan Mapping Tabel per Fitur)
_Terakhir diperbarui: 2025-08-20_

> **Catatan Cetak (PDF):** Saat ekspor ke PDF, set **orientation = Landscape** agar tabel lebar tidak terpotong.

---

## Daftar Isi
- [Apa itu BDD](#apa-itu-bdd)
- [Apa itu Cucumber](#apa-itu-cucumber)
- [Apa itu Gherkin](#apa-itu-gherkin)
- [Mengapa Harus Pakai Gherkin](#mengapa-harus-pakai-gherkin)
- [Keuntungan Pakai Gherkin](#keuntungan-pakai-gherkin)
- [Format Gherkin Syntax](#format-gherkin-syntax)
- [Konvensi & Template Mapping Gherkin → Tabel Test Case](#konvensi--template-mapping-gherkin--tabel-test-case)
- [Studi Case Gherkin Dasar + Mapping Tabel](#studi-case-gherkin-dasar--mapping-tabel)
  - [Fitur 1 — Login](#fitur-1--login)
  - [Fitur 2 — Reset Password](#fitur-2--reset-password)
  - [Fitur 3 — Update Profil](#fitur-3--update-profil)
- [Studi Case Gherkin Menengah + Mapping Tabel](#studi-case-gherkin-menengah--mapping-tabel)
  - [Fitur 4 — Pencarian Produk](#fitur-4--pencarian-produk)
  - [Fitur 5 — Keranjang](#fitur-5--keranjang)
  - [Fitur 6 — Checkout](#fitur-6--checkout)
- [Studi Case Gherkin Lanjutan / Tinggi + Mapping Tabel](#studi-case-gherkin-lanjutan--tinggi--mapping-tabel)
  - [Fitur 7 — Targeting Banner](#fitur-7--targeting-banner)
  - [Fitur 8 — Akses & Audit](#fitur-8--akses--audit)
- [Lampiran: Cheat Sheet Gherkin](#lampiran-cheat-sheet-gherkin)

---

## Apa itu BDD
**Behavior-Driven Development (BDD)** menekankan spesifikasi berbasis contoh yang bisa dieksekusi (executable specifications) untuk menyatukan pemahaman bisnis, QA, dan engineering.

## Apa itu Cucumber
**Cucumber** mengeksekusi skenario berbahasa **Gherkin** dan menghubungkan langkahnya ke **step definitions** (kode) untuk otomatisasi.

## Apa itu Gherkin
**Gherkin** adalah bahasa spesifikasi terstruktur (**Feature**, **Scenario/Scenario Outline**, **Given/When/Then**) yang mudah dibaca dan dapat dieksekusi.

## Mengapa Harus Pakai Gherkin
- Bahasa bersama yang dipahami non-teknis
- Fokus pada **perilaku** (value), bukan implementasi
- Memudahkan otomasi & menjadi living documentation

## Keuntungan Pakai Gherkin
- Konsistensi & mengurangi ambiguitas
- Mempercepat review & handover
- Reusability langkah & data uji

## Format Gherkin Syntax
```gherkin
Feature: Judul fitur
  Background:
    Given kondisi awal bersama

  Scenario: Nama skenario
    Given prasyarat
    When aksi utama
    Then hasil yang diharapkan

  Scenario Outline: Nama outline
    Given ...
    When ...
    Then ...
    Examples:
      | kolom1 | kolom2 |
      | A      | B      |
```

## Konvensi & Template Mapping Gherkin → Tabel Test Case
Kolom tabel yang direkomendasikan:
- `TC_ID`, `Title`, `Feature`, `Precondition (Given)`, `Test Steps (When/And)`, `Expected Result (Then/And)`, `Priority (P0–P3)`, `Type (Positive/Negative)`, `Tags`, `Test Data`, `Notes`

Aturan ringkas:
1. **Given** → Precondition (bullet/numbering)
2. **When/And (setelah When)** → Test Steps bernomor
3. **Then/And (setelah Then)** → Expected Result bernomor
4. **Scenario Outline** → setiap baris **Examples** = 1 test case
5. **Priority**: P0 (blocker/keamanan/finansial), P1 (jalur utama), P2 (variasi umum), P3 (kosmetik/edge ringan)

---

# Studi Case Gherkin Dasar + Mapping Tabel

## Fitur 1 — Login
```gherkin
Feature: Login
  Background:
    Given aplikasi menampilkan halaman Login

  Scenario: Login sukses dengan kredensial valid
    When user mengisi username "user1"
    And user mengisi password "Passw0rd!"
    And user menekan tombol "Login"
    Then user diarahkan ke halaman "Dashboard"
    And nama "User One" tampil di header

  Scenario: Login gagal dengan password salah
    When user mengisi username "user1"
    And user mengisi password "salah"
    And user menekan tombol "Login"
    Then pesan error "Username atau password salah" tampil
    And tetap berada di halaman "Login"

  Scenario: Validasi field kosong
    When user menekan tombol "Login" tanpa mengisi form
    Then pesan validasi "Username wajib diisi" tampil
    And pesan validasi "Password wajib diisi" tampil

  Scenario: Rate limit setelah 5 kali gagal
    When user gagal login 5 kali berturut-turut
    Then akun terkunci sementara selama 15 menit
    And email notifikasi terkirim ke user
```

**Mapping Tabel — Login**
| TC_ID | Title | Feature | Precondition (Given) | Test Steps (When/And) | Expected Result (Then/And) | Priority | Type | Tags | Test Data |
|---:|---|---|---|---|---|:--:|---|---|---|
| LGN-01 | Login sukses | Login | - Halaman Login | 1. Isi username "user1"<br>2. Isi password "Passw0rd!"<br>3. Klik "Login" | 1. Ke "Dashboard"<br>2. Nama "User One" tampil | P0 | Positive | @smoke @happy | user1/Passw0rd! |
| LGN-02 | Password salah | Login | - Halaman Login | 1. Isi username "user1"<br>2. Isi password "salah"<br>3. Klik "Login" | 1. Error "Username atau password salah"<br>2. Tetap di "Login" | P0 | Negative | @auth @validation | user1/salah |
| LGN-03 | Field kosong | Login | - Halaman Login | 1. Klik "Login" tanpa isi | 1. Validasi username<br>2. Validasi password | P1 | Negative | @validation | - |
| LGN-04 | Rate limit | Login | - Halaman Login | 1. Gagal login ×5 | 1. Akun terkunci 15 menit<br>2. Email notifikasi terkirim | P0 | Negative | @security @rate-limit | - |

---

## Fitur 2 — Reset Password
```gherkin
Feature: Reset Password
  Background:
    Given user berada di halaman "Forgot Password"

  Scenario: Kirim tautan reset ke email terdaftar
    When user memasukkan email "user1@contoh.com"
    And menekan tombol "Kirim"
    Then pesan "Email reset terkirim" tampil
    And email reset diterima di "user1@contoh.com"

  Scenario: Email tidak terdaftar
    When user memasukkan email "unknown@contoh.com"
    And menekan tombol "Kirim"
    Then pesan "Email tidak terdaftar" tampil

  Scenario: Format email tidak valid
    When user memasukkan email "user1@"
    And menekan tombol "Kirim"
    Then pesan "Format email tidak valid" tampil

  Scenario: Set password baru dari tautan valid
    Given user membuka tautan reset yang masih berlaku
    When user mengisi password baru "Str0ng#Pwd"
    And konfirmasi password "Str0ng#Pwd"
    And menekan "Simpan"
    Then pesan "Password berhasil diubah" tampil
    And user dapat login dengan password baru
```

**Mapping Tabel — Reset Password**
| TC_ID | Title | Feature | Precondition (Given) | Test Steps (When/And) | Expected Result (Then/And) | Priority | Type | Tags | Test Data |
|---:|---|---|---|---|---|:--:|---|---|---|
| RST-01 | Kirim tautan reset | Reset Password | - Halaman Forgot Password | 1. Isi email "user1@contoh.com"<br>2. Klik "Kirim" | 1. Pesan "Email reset terkirim"<br>2. Email diterima | P1 | Positive | @recovery @email | user1@contoh.com |
| RST-02 | Email tidak terdaftar | Reset Password | - Halaman Forgot Password | 1. Isi email "unknown@contoh.com"<br>2. Klik "Kirim" | 1. Pesan "Email tidak terdaftar" | P1 | Negative | @validation | unknown@contoh.com |
| RST-03 | Format email invalid | Reset Password | - Halaman Forgot Password | 1. Isi email "user1@"<br>2. Klik "Kirim" | 1. Pesan "Format email tidak valid" | P2 | Negative | @validation | user1@ |
| RST-04 | Set password baru | Reset Password | - Tautan reset valid & aktif | 1. Isi pwd baru "Str0ng#Pwd"<br>2. Konfirmasi pwd sama<br>3. Klik "Simpan" | 1. Pesan sukses<br>2. Bisa login dengan pwd baru | P0 | Positive | @recovery | pwd=Str0ng#Pwd |

---

## Fitur 3 — Update Profil
```gherkin
Feature: Update Profil
  Background:
    Given user sudah login

  Scenario: Update nama & nomor telepon valid
    When user membuka halaman "Profil"
    And mengubah nama menjadi "User One"
    And mengubah telepon menjadi "08123456789"
    And menekan "Simpan"
    Then pesan "Profil tersimpan" tampil
    And data profil terbarui

  Scenario: Nomor telepon terlalu pendek
    When user membuka halaman "Profil"
    And mengubah telepon menjadi "0812"
    And menekan "Simpan"
    Then pesan "Nomor telepon minimal 10 digit" tampil
    And perubahan tidak disimpan
```

**Mapping Tabel — Update Profil**
| TC_ID | Title | Feature | Precondition (Given) | Test Steps (When/And) | Expected Result (Then/And) | Priority | Type | Tags | Test Data |
|---:|---|---|---|---|---|:--:|---|---|---|
| PRF-01 | Update profil valid | Update Profil | - User login | 1. Buka Profil<br>2. Ganti nama "User One"<br>3. Ganti telepon "08123456789"<br>4. Simpan | 1. "Profil tersimpan"<br>2. Data terbarui | P1 | Positive | @profile | telp=08123456789 |
| PRF-02 | Telepon terlalu pendek | Update Profil | - User login | 1. Buka Profil<br>2. Ganti telepon "0812"<br>3. Simpan | 1. Error min 10 digit<br>2. Tidak tersimpan | P2 | Negative | @validation | telp=0812 |

---

# Studi Case Gherkin Menengah + Mapping Tabel

## Fitur 4 — Pencarian Produk
```gherkin
Feature: Pencarian Produk

  Scenario Outline: Pencarian menampilkan hasil yang relevan
    Given berada di halaman "Beranda"
    When mengetik "<kata_kunci>" di kotak pencarian
    And menekan tombol "Cari"
    Then daftar produk terkait "<kata_kunci>" tampil
    And setiap kartu produk menampilkan nama & harga

    Examples:
      | kata_kunci   |
      | kopi         |
      | susu         |
      | cokelat      |

  Scenario: Pencarian tanpa keyword
    Given berada di halaman "Beranda"
    When menekan tombol "Cari" tanpa mengetik apapun
    Then pesan "Masukkan kata kunci" tampil

  Scenario: Tidak ada hasil
    Given berada di halaman "Beranda"
    When mengetik "zzzitemtidakada"
    And menekan "Cari"
    Then pesan "Produk tidak ditemukan" tampil
```

**Mapping Tabel — Pencarian Produk**
| TC_ID | Title | Feature | Precondition (Given) | Test Steps (When/And) | Expected Result (Then/And) | Priority | Type | Tags | Test Data |
|---:|---|---|---|---|---|:--:|---|---|---|
| SRC-01 | Pencarian relevan - kopi | Pencarian Produk | - Di "Beranda" | 1. Ketik "kopi"<br>2. Klik "Cari" | 1. Daftar produk terkait kopi<br>2. Kartu tampil nama & harga | P1 | Positive | @search @happy | keyword=kopi |
| SRC-02 | Pencarian relevan - susu | Pencarian Produk | - Di "Beranda" | 1. Ketik "susu"<br>2. Klik "Cari" | 1. Daftar produk terkait susu<br>2. Kartu tampil nama & harga | P1 | Positive | @search | keyword=susu |
| SRC-03 | Pencarian relevan - cokelat | Pencarian Produk | - Di "Beranda" | 1. Ketik "cokelat"<br>2. Klik "Cari" | 1. Daftar produk terkait cokelat<br>2. Kartu tampil nama & harga | P1 | Positive | @search | keyword=cokelat |
| SRC-04 | Tanpa keyword | Pencarian Produk | - Di "Beranda" | 1. Klik "Cari" tanpa input | 1. Pesan "Masukkan kata kunci" | P2 | Negative | @validation | - |
| SRC-05 | Tidak ada hasil | Pencarian Produk | - Di "Beranda" | 1. Ketik "zzzitemtidakada"<br>2. Klik "Cari" | 1. Pesan "Produk tidak ditemukan" | P2 | Negative | @edge | keyword=zzzitemtidakada |

---

## Fitur 5 — Keranjang
```gherkin
Feature: Keranjang
  Background:
    Given berada di halaman "Detail Produk" dari produk "Kopi Robusta"

  Scenario: Tambah produk ke keranjang
    When menekan "Tambah ke Keranjang"
    Then ikon keranjang menampilkan jumlah 1
    And notifikasi "Ditambahkan ke keranjang" tampil

  Scenario: Ubah kuantitas di keranjang
    Given item "Kopi Robusta" ada di keranjang
    When membuka keranjang
    And mengubah kuantitas menjadi 3
    Then subtotal mengikuti kuantitas

  Scenario: Hapus item mengosongkan keranjang
    Given item "Kopi Robusta" ada di keranjang
    When membuka keranjang
    And menghapus item
    Then pesan "Keranjang kosong" tampil

  Scenario: Batas kuantitas maksimum
    Given item "Kopi Robusta" ada di keranjang
    When membuka keranjang
    And mengubah kuantitas menjadi 999
    Then pesan "Maksimal 100 item per produk" tampil
```

**Mapping Tabel — Keranjang**
| TC_ID | Title | Feature | Precondition (Given) | Test Steps (When/And) | Expected Result (Then/And) | Priority | Type | Tags | Test Data |
|---:|---|---|---|---|---|:--:|---|---|---|
| CRT-01 | Tambah ke keranjang | Keranjang | - Di Detail Produk "Kopi Robusta" | 1. Klik "Tambah ke Keranjang" | 1. Ikon=1<br>2. Notifikasi tampil | P1 | Positive | @cart @happy | sku=kopi-robusta |
| CRT-02 | Ubah kuantitas | Keranjang | - Item ada di keranjang | 1. Buka keranjang<br>2. Ubah qty=3 | 1. Subtotal menyesuaikan | P1 | Positive | @cart | qty=3 |
| CRT-03 | Hapus item | Keranjang | - Item ada di keranjang | 1. Buka keranjang<br>2. Hapus item | 1. "Keranjang kosong" | P2 | Negative | @cart | - |
| CRT-04 | Batas maksimum | Keranjang | - Item ada di keranjang | 1. Buka keranjang<br>2. Ubah qty=999 | 1. Error "Maksimal 100 item" | P2 | Negative | @validation | qty=999 |

---

## Fitur 6 — Checkout
```gherkin
Feature: Checkout
  Background:
    Given user sudah login
    And keranjang berisi setidaknya 1 produk

  Scenario: Checkout sukses dengan pembayaran kartu
    When membuka halaman "Checkout"
    And memilih alamat pengiriman utama
    And memilih metode "Kartu Kredit"
    And mengisi detail kartu valid
    And menekan "Bayar"
    Then transaksi berhasil dengan nomor order
    And email konfirmasi dikirim

  Scenario: Alamat belum dipilih
    When membuka halaman "Checkout"
    And tidak memilih alamat
    And menekan "Bayar"
    Then pesan "Pilih alamat pengiriman" tampil

  Scenario: Gagal pembayaran (ditolak bank)
    When membuka halaman "Checkout"
    And memilih metode "Kartu Kredit"
    And mengisi kartu ditolak
    And menekan "Bayar"
    Then pesan "Pembayaran ditolak" tampil
    And order tidak dibuat
```

**Mapping Tabel — Checkout**
| TC_ID | Title | Feature | Precondition (Given) | Test Steps (When/And) | Expected Result (Then/And) | Priority | Type | Tags | Test Data |
|---:|---|---|---|---|---|:--:|---|---|---|
| CHK-01 | Checkout sukses kartu | Checkout | - Login<br>- Keranjang ≥1 item | 1. Buka Checkout<br>2. Pilih alamat utama<br>3. Metode "Kartu Kredit"<br>4. Isi kartu valid<br>5. Bayar | 1. Order no. dibuat<br>2. Email konfirmasi | P0 | Positive | @payment @happy | cc=valid |
| CHK-02 | Alamat belum dipilih | Checkout | - Login<br>- Keranjang ≥1 item | 1. Buka Checkout<br>2. Tidak pilih alamat<br>3. Bayar | 1. Error "Pilih alamat pengiriman" | P0 | Negative | @validation | - |
| CHK-03 | Pembayaran ditolak | Checkout | - Login<br>- Keranjang ≥1 item | 1. Buka Checkout<br>2. Pilih "Kartu Kredit"<br>3. Isi kartu ditolak<br>4. Bayar | 1. Error "Pembayaran ditolak"<br>2. Order tidak dibuat | P0 | Negative | @payment | cc=declined |

---

# Studi Case Gherkin Lanjutan / Tinggi + Mapping Tabel

## Fitur 7 — Targeting Banner
```gherkin
Feature: Targeting Banner
  Background:
    Given admin login dan berada di "Pengaturan Banner"

  Scenario Outline: Pratinjau penayangan sesuai segmentasi
    When admin memilih tipe banner "Grosir"
    And memilih target "<tipe_target>"
    And memilih nilai target "<nilai>"
    And menekan "Pratinjau"
    Then pratinjau menampilkan banner hanya kepada target "<tipe_target>" = "<nilai>"

    Examples:
      | tipe_target | nilai      |
      | region      | Jakarta    |
      | grosir      | Grosir ABC |
      | mid         | MID-000123 |

  Scenario: Target tidak valid
    When admin memilih tipe banner "Grosir"
    And memilih target "mid"
    And memilih nilai target "MID-TIDAK-ADA"
    And menekan "Pratinjau"
    Then pesan "Target tidak ditemukan" tampil

  Scenario: Simpan konfigurasi berhasil
    When admin memilih tipe banner "Grosir"
    And set periode aktif 2025-08-01 s.d 2025-08-31
    And menekan "Simpan"
    Then pesan "Konfigurasi tersimpan" tampil
    And status banner "Aktif"

  Scenario: Periode tumpang tindih
    Given sudah ada banner aktif periode 2025-08-10 s.d 2025-08-20
    When admin menyimpan banner baru periode 2025-08-15 s.d 2025-08-25
    Then pesan "Periode tumpang tindih" tampil
    And penyimpanan dibatalkan

  Scenario: Admin tanpa izin mencoba mengubah banner
    Given pengguna role "Viewer" login
    When membuka "Pengaturan Banner"
    And mencoba menyimpan perubahan
    Then pesan "Akses ditolak" tampil

  Scenario: Rate limit pratinjau
    When admin menekan "Pratinjau" lebih dari 30 kali/menit
    Then pesan "Terlalu banyak permintaan, coba lagi" tampil
```

**Mapping Tabel — Targeting Banner**
| TC_ID | Title | Feature | Precondition (Given) | Test Steps (When/And) | Expected Result (Then/And) | Priority | Type | Tags | Test Data |
|---:|---|---|---|---|---|:--:|---|---|---|
| BNR-01 | Preview target region | Targeting Banner | - Admin login di Pengaturan Banner | 1. Pilih tipe "Grosir"<br>2. Target "region"=Jakarta<br>3. Pratinjau | 1. Pratinjau hanya region Jakarta | P1 | Positive | @banner @preview | region=Jakarta |
| BNR-02 | Preview target grosir | Targeting Banner | - Admin login di Pengaturan Banner | 1. Tipe "Grosir"<br>2. Target "grosir"=Grosir ABC<br>3. Pratinjau | 1. Pratinjau hanya Grosir ABC | P1 | Positive | @banner | grosir=Grosir ABC |
| BNR-03 | Preview target MID | Targeting Banner | - Admin login di Pengaturan Banner | 1. Tipe "Grosir"<br>2. Target "mid"=MID-000123<br>3. Pratinjau | 1. Pratinjau hanya MID-000123 | P1 | Positive | @banner | mid=MID-000123 |
| BNR-04 | Target tidak valid | Targeting Banner | - Admin login di Pengaturan Banner | 1. Tipe "Grosir"<br>2. Target mid=INVALID<br>3. Pratinjau | 1. Error "Target tidak ditemukan" | P1 | Negative | @validation | mid=MID-TIDAK-ADA |
| BNR-05 | Simpan konfigurasi | Targeting Banner | - Admin login | 1. Set periode 2025-08-01..2025-08-31<br>2. Simpan | 1. "Konfigurasi tersimpan"<br>2. Status Aktif | P0 | Positive | @save | periode valid |
| BNR-06 | Periode overlap | Targeting Banner | - Sudah ada banner 2025-08-10..20 | 1. Simpan banner 2025-08-15..25 | 1. Error "Periode tumpang tindih"<br>2. Batal simpan | P0 | Negative | @rules | tanggal overlap |
| BNR-07 | Akses ditolak viewer | Targeting Banner | - Pengguna role Viewer login | 1. Buka Pengaturan Banner<br>2. Coba simpan | 1. Error "Akses ditolak" | P0 | Negative | @security @rbac | role=viewer |
| BNR-08 | Rate limit preview | Targeting Banner | - Admin login | 1. Klik Pratinjau >30x/menit | 1. Error "Terlalu banyak permintaan" | P2 | Negative | @rate-limit | - |

---

## Fitur 8 — Akses & Audit
```gherkin
Feature: Akses & Audit

  Scenario: Catat audit pada perubahan konfigurasi
    Given admin login
    When menyimpan perubahan banner
    Then entri audit tercatat dengan user, waktu, dan diff konfigurasi

  Scenario: Audit gagal saat storage penuh
    Given storage audit mencapai 100%
    When admin menyimpan perubahan
    Then penyimpanan diblokir
    And pesan "Audit storage penuh" tampil

  Scenario: Ekspor audit per tanggal
    Given admin berada di halaman "Audit"
    When memilih rentang tanggal 2025-08-01 s.d 2025-08-15
    And menekan "Ekspor CSV"
    Then file CSV terunduh berisi entri pada rentang tersebut

  Scenario: Access token kedaluwarsa
    Given admin login lebih dari 60 menit lalu
    When mengakses "Pengaturan Banner"
    Then diminta login ulang
```

**Mapping Tabel — Akses & Audit**
| TC_ID | Title | Feature | Precondition (Given) | Test Steps (When/And) | Expected Result (Then/And) | Priority | Type | Tags | Test Data |
|---:|---|---|---|---|---|:--:|---|---|---|
| AUD-01 | Audit tercatat | Akses & Audit | - Admin login | 1. Simpan perubahan banner | 1. Audit berisi user/waktu/diff | P1 | Positive | @audit | - |
| AUD-02 | Storage audit penuh | Akses & Audit | - Storage=100% | 1. Simpan perubahan | 1. Simpan diblokir<br>2. Pesan storage penuh | P0 | Negative | @reliability @safety | storage=full |
| AUD-03 | Ekspor audit | Akses & Audit | - Di halaman Audit | 1. Pilih tanggal 2025-08-01..15<br>2. Ekspor CSV | 1. CSV berisi entri pada rentang | P2 | Positive | @export | range=2025-08-01..15 |
| AUD-04 | Token kedaluwarsa | Akses & Audit | - Login >60 menit | 1. Akses Pengaturan Banner | 1. Diminta login ulang | P0 | Negative | @security @session | ttl>60m |

---

## Lampiran: Cheat Sheet Gherkin
- **Given** = prasyarat; **When** = aksi; **Then** = verifikasi
- **And/But** mengikuti jenis langkah sebelumnya
- Gunakan **Scenario Outline + Examples** untuk variasi data
- Satu skenario = satu tujuan terukur; jangan terlalu panjang
- Fokus pada perilaku, bukan detail teknis UI
- Gunakan **Tags**: `@smoke`, `@regression`, `@security`, `@negative`, dsb.
- **Priority** berdasar dampak & probabilitas
