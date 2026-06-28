---
title: Tutorial Gherkin v6
---

# 1. Pendahuluan

Gherkin adalah bahasa yang digunakan untuk menuliskan test case dalam
format yang bisa dibaca manusia dan dapat dijalankan oleh tools BDD
(Behavior-Driven Development) seperti Cucumber. Versi Gherkin v6
mendukung struktur modern termasuk penggunaan \`Rule:\` untuk
mengelompokkan skenario.

# 2. Struktur Dasar Gherkin v6

Struktur file Gherkin terdiri dari:

\- Feature: mendeskripsikan fungsi atau kapabilitas yang diuji.

\- Background: langkah-langkah yang selalu dijalankan sebelum setiap
Scenario/Scenario Outline.

\- Rule: mengelompokkan Scenario berdasarkan aturan tertentu.

\- Scenario: mendeskripsikan kasus uji spesifik.

\- Scenario Outline + Examples: digunakan untuk parameterisasi skenario.

\- Step: langkah-langkah Given, When, Then (bisa juga And, But).

# 3. Contoh Kasus Sederhana

Contoh validasi login sederhana:

Feature: Login Functionality\
Scenario: Successful login with valid credentials\
Given user is on the login page\
When user enters valid username and password\
Then user should be redirected to the dashboard

# 4. Contoh Menggunakan Background

Feature: Shopping Cart\
Background:\
Given user is logged in\
And user has an empty cart\
\
Scenario: Add a product to cart\
When user adds a product\
Then cart should contain 1 item\
\
Scenario: Remove product from cart\
Given user already added a product\
When user removes the product\
Then cart should be empty

# 5. Contoh Rule

Feature: Bank Account Transactions\
Rule: Account must not be overdrawn\
Background:\
Given user has \$100 balance\
\
Scenario: Withdraw within balance\
When user withdraws \$50\
Then account balance should be \$50\
\
Scenario: Withdraw exceeding balance\
When user withdraws \$200\
Then transaction should be declined

# 6. Contoh Scenario Outline

Feature: User Login Attempts\
Scenario Outline: Login with different credentials\
Given user is on the login page\
When user enters \<username\> and \<password\>\
Then login \<status\>\
\
Examples:\
\| username \| password \| status \|\
\| admin \| 12345 \| success \|\
\| user \| wrong \| failure \|

# 7. Aturan (Rules) dan Hal yang Tidak Boleh Dilanggar

Beberapa aturan penting dalam Gherkin v6:

\- Hanya boleh ada satu Feature per file.

\- Background hanya boleh satu di level Feature, tetapi setiap Rule
boleh punya Background sendiri.

\- Setiap Scenario harus punya nama yang unik.

\- Step (Given/When/Then) tidak boleh ditulis langsung di bawah Feature
tanpa Scenario atau Background.

\- Scenario Outline harus diikuti oleh Examples.

\- Tidak boleh ada duplikasi Scenario dengan nama sama dalam satu
Feature.

# 8. Contoh Pelanggaran

Contoh kesalahan umum:

Feature: Invalid Example\
\
Scenario: Duplicate name\
Given something happens\
\
Scenario: Duplicate name\
Given something else

=\> Ini melanggar aturan karena nama Scenario duplikat.

Feature: Invalid Background\
\
Background:\
Given first setup\
\
Background:\
Given second setup

=\> Ini melanggar aturan karena ada lebih dari satu Background di level
Feature.

# 9. Contoh Kombinasi Rule + Scenario Outline

Feature: E-commerce Checkout\
Rule: Payment method validation\
Background:\
Given user has items in the cart\
And user is on the checkout page\
\
Scenario Outline: Pay with different methods\
When user selects \<paymentMethod\>\
And user enters valid payment details\
Then the payment should be \<status\>\
\
Examples:\
\| paymentMethod \| status \|\
\| Credit Card \| success \|\
\| PayPal \| success \|\
\| Expired Card \| failure \|\
\| Bank Transfer \| success \|

# 10. Ringkasan Aturan Gherkin v6

  -----------------------------------------------------------------------
  Aturan                              Penjelasan
  ----------------------------------- -----------------------------------
  Satu Feature per file               Setiap file hanya boleh memiliki
                                      satu Feature utama.

  Background terbatas                 Hanya boleh satu Background di
                                      level Feature. Setiap Rule boleh
                                      memiliki satu Background sendiri.

  Scenario unik                       Nama setiap Scenario harus unik
                                      dalam satu Feature.

  Langkah hanya dalam                 Given/When/Then/And/But tidak boleh
  Scenario/Background                 langsung di bawah Feature atau Rule
                                      tanpa Scenario/Background.

  Scenario Outline wajib Examples     Scenario Outline harus memiliki
                                      tabel Examples agar parameter bisa
                                      diisi.

  No duplicate Scenario               Tidak boleh ada Scenario dengan
                                      nama sama dalam satu Feature.

  Rule opsional                       Rule digunakan untuk mengelompokkan
                                      Scenario. Jika tidak dipakai,
                                      Scenario boleh langsung di bawah
                                      Feature.

  Comments                            Boleh menggunakan \# untuk
                                      komentar. Tidak memengaruhi
                                      eksekusi.

  Tags                                Boleh menggunakan \@tag untuk
                                      menandai Scenario atau Feature
                                      untuk filtering eksekusi.
  -----------------------------------------------------------------------

# 11. Penutup

Gherkin v6 memberikan fleksibilitas dalam menulis test case yang dapat
dibaca manusia sekaligus dipahami mesin. Dengan mematuhi aturan-aturan
dasar, penulisan Feature file menjadi lebih terstruktur, mudah
dipelihara, dan dapat dijalankan di berbagai tool BDD modern seperti
Cucumber. Gunakan Feature, Scenario, Background, Rule, dan Scenario
Outline sesuai kebutuhan, serta hindari pelanggaran aturan umum agar
file tetap valid.
