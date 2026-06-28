Feature: Deliver Blast WA untuk Transaksi Bayar Nanti Customer Whitelist

@p0 @positive
Scenario Outline: membuka Module Whitelist Customer Bayar Nanti
    Given telah tiba di website monitoring
    And role pengguna : "<role>"
    When klik Module Whitelist Customer Bayar Nanti
    Then halaman Module Whitelist Customer Bayar Nanti terbuka. 
    And Muncul daftar warung yang masuk pada Whitelist

    Examples:
        | role |
        | admin |
        | staff |

@p0
Scenario Outline: tambah warung ke whitlist dengan role "<role>"
    Given telah tiba di halaman Module Whitelist Customer Bayar Nanti
    And role pengguna : "<role>"
    When tekan tombol "Filter"
    Then warung "<hasil>" ditambahkan pada whitelist

    Examples:
        | role      | hasil     |
        | admin     | berhasil  |
        | staff     | gagal     |

@p0
Scenario Outline: hapus warung ke whitelist dengan role "<role>"
    Given terdapat warug pada whitelist
    And role pengguna : "<role>"
    When klik tombol "Hapus" pada salah satu row Warung
    Then muncul pesan "<pesan>". warung "<status_terhapus>" dari whitelist

    Examples:
    | role      | pesan                                      | status_terhapus  |
    | admin     | warung berhasil dihapus dari wihtlist      | terhapus         |
    | staff     | role anda tidak memilki akses ke fitur ini | tidak terhapus   |

@p0
Scenario Outline: pengguna mendapatkan chat wa dari transaksi belajan dengan metode bayar nanti "<whitelist>"
    Given penggunan telah tiba di halaman konfirmasi transaksi belanja grosir
    And pengguna "<whitelist>" pada whitelist
    When pilih metode pembayaran : bayar nanti
    Then pengguna mendapatkan chat wa dengan "<template>"

    Examples:
        | whitelist         | template      |
        | terdaftar         | template 1    |
        | tidak terdaftar   | template 2    |

