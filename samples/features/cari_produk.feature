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