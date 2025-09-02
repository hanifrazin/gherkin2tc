Feature: Validasi Approval Foto Display
    meningkatkan keamanan validasi approval foto disylay dengan melarangu approval yang setangah terisi dari produk yang di approv

        Background:
            Given telah tiba di halaman modal approve display

    # berhasil menolak approve kosong # ? apakah ini diperlukan
    # berhasil menolak reject kosong # ? apakah ini diperlukan

        Scenario Outline: berhasil menolak <status approve> kosong
             When klik tombol "SUBMIT"
             Then muncul pesan peringatan "<pesan>"

        Examples:
                  | status approve | pesan                   |
                  | approve        | approve display ditolak |
                  | reject         | approve display ditolak |

    # berhasil menolak approve sebagian
        Scenario: berhasil menolak approve sebagian
             When centang approve display produk paling atas
              And klik tombol "SUBMIT"
             Then <pesan ditolak>
        Examples:
                  | pesan ditolak             |
                  | "approve display ditolak" |
    
    
    # berhsail menolak reject sebagian
        # semua tanpa alasan
        # semua dengan alasan pilihan
        # semua dengan alasan custom
        # sebagian beralasan
        
        Scenario Outline: berhasil menolak reject sebagian dengan <keterangan>
             When  centang reject display produk paling atas
              And keterangan dengan <isi keterangan>
             Then <pesan ditolak>


        Examples:
                  | keterangan                  | isi keterangan             | pesan ditolak                  |
                  | semua tanpa alasan          | kosong                     | approve produk display ditolak |
                  | semua dengan alasan pilihan | "VARIAN PRODUK BERBEDA"    | approve produk display ditolak |
                  | semua dengan alasan custom  | "produk tidak memilki isi" | approve produk display ditolak |

        
    # berhasil menolak approve sebagian setelah centang Approve All
        Scenario Outline: berhasil menolak approve sebagian setelah centang All
             When centang Approve all
              And klik centang approve produk paling atas
             Then <pesan ditolak>
             
        Examples:
                  | pesan ditolak                  |
                  | approve produk display ditolak |
    
    # berhasil menolak reject sebagian setelah centang Reject All 
        # tanpa alasan
        # dengan alasan pilihan
        # dengan alasan custom 

        Scenario Outline: berhasil menolak reject sebagian setelah centang Reject All dengan <keterangan>
             When centang "Reject all"
              And centang salah satu produk approve
              And keterangan dengan <isi keterangan>
              And klik centang produk yang approve
             Then <pesan ditolak>

        Examples:
                  | keterangan               | isi keterangan             | pesan ditolak                  |
                  | semua isi tanpa alasan   | kosong                     | approve produk display ditolak |
                  | semua isi alasan pilihan | "VARIAN PRODUK BERBEDA"    | approve produk display ditolak |
                  | semua isi alasan custom  | "produk tidak memilki isi" | approve produk display ditolak |

    # berhasil tidak munculi cell pada kolom Status Pendding dengan warna background kuning # ? apakah warna kuning hanya karena approval yang belum lengkap
    # ? bagaimana jadinya bila aku mengisi terlalu cepat 
