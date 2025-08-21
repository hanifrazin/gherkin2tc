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