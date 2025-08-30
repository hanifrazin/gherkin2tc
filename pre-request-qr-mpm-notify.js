// Definisikan URL endpoint untuk request token
const urlAccessTokenB2B = "https://openapi-staging.bersama.co.id/v2.0/access-token/b2b/";
let access_token = 'cxmresDXNQuWwYR7U';

// Body untuk request (ubah sesuai kebutuhan API)
const requestBody = {
    grantType: "client_credentials",
    additionalInfo: {
        partnerId: "STG-PTNIDNB134420250826"
    }
};

// Header statis sesuai requirement
const staticHeaders = [
    { key: "Content-Type", value: "application/json" },
    { key: "Accept", value: "application/json" },
    { key: "X-TIMESTAMP", value: "2022-02-24T14:43:01+07:00"},
    { key: "X-SIGNATURE", value: "cxmresDXNQuWwYR7UpwORzX++5mbWSd7d9EzHPmeS7eEOW5QvGBekL/4hcJ+Yc6f7CVHf/QzMWqki3y4sluJ5+Frvwk6l7++sUm2cbwaFEmrFEMmdxshE+dwb90NQpTTVG6xUrmg4lv9VnGxUMmtM8uZ7t0T4TTN9z097wfXBjr6TVIdVYsvIWUNkX9KvdB5F/eZ8TDoTRtO+lSAu1EMAYF4d5BHcvALrtUXcg5o8so0OWaG6Tr2gQny+7PzKRqJRu48NUmgr5y8gY2txKZjvpMj9lNQDipjZf7f489DWehqSOW4AesRI+FPM3BJeKMdnB8M8BA30oQpuxalrhqPWg==" },
    { key:"X-CLIENT-KEY", value: "f0ea57dd-28f4-4017-ae79-c1f16edf1ea9" } // contoh UUID
];

// Jalankan request untuk dapatkan token
pm.sendRequest({
    url: urlAccessTokenB2B,
    method: "POST",
    header: staticHeaders,
    body: {
        mode: "raw",
        raw: JSON.stringify(requestBody)
    }
}, (err, res) => {
    if (err) {
        console.error("Error saat request token:", err);
    } else {
        console.log("Response :", res.json());
        // Simpan access_token ke environment variable
        access_token = res.json().accessToken;
        console.log(`Access Token = ${access_token}`)
        pm.moduleVariables.set("nobu-access-token", access_token);
    }
});


// Definisikan URL endpoint untuk request token
const urlGetXSignature = "https://openapi-staging.bersama.co.id/v1.0/qr/generate/signature";
let XSignature_QR_MPM = 'cxmresDXNQuWwYR7U';

// Body untuk request (ubah sesuai kebutuhan API)
const requestBodyXSignature_QR_MPM = {
    originalReferenceNo: "",
    originalPartnerReferenceNo: "",
    latestTransactionStatus: "00",
    transactionStatusDesc: "Success",
    amount: {
        value: "123321.00",
        currency: "IDR"
    },
    externalStoreId: "ID2020081400453",
    additionalInfo: {
        callbackUrl: "https://webhook.site/9ef27d50-5280-41ed-8722-4b54fd7b1b3b",
        issuerId: "93600987",
        merchantId: "9360000915039842551",
        paymentDate: "2024-04-29 20:17:42",
        retrievalReferenceNo: "266372099719",
        paymentReferenceNo: "1010224042900002975120000492948"
    }
};

// Header statis sesuai requirement
const staticHeadersXSignature = [
    { key: "Content-Type", value: "application/json" },
    { key: "Accept", value: "application/json" },
    { key: "X-TIMESTAMP", value: "2024-04-29T20:17:47+07:00"},
    { key: "X-EXTERNAL-D", value: "717885588574"},
    { key: "X-PARTNER-ID", value: pm.moduleVariables.get("NOBU-X-PARTNER-ID")},
    { key: "X-SIGNATURE", value: pm.moduleVariables.get("X-SIGNATURE-QR-MPM-NOTIFY") },
    { key: "X-IP-ADDRESS", value: "1221414"},
    { key: "CHANNEL-ID", value: "APIMGM"},
    { key: "X-CLIENT-KEY", value: "f0ea57dd-28f4-4017-ae79-c1f16edf1ea9"},
    { key: "Authorization", value: `Bearer ${pm.moduleVariables.get("nobu-access-token")}` } // contoh UUID
];

// Jalankan request untuk dapatkan token
pm.sendRequest({
    url: urlGetXSignature,
    method: "POST",
    header: staticHeadersXSignature,
    body: {
        mode: "raw",
        raw: JSON.stringify(requestBodyXSignature_QR_MPM)
    }
}, (err, res) => {
    if (err) {
        console.error("Error saat request token:", err);
    } else {
        console.log("Response Get X Signature for QR MPM Notify:", res.json());
        // Simpan access_token ke environment variable

        XSignature_QR_MPM = res.json().responseMessage;
        console.log(`X-SIGNATURE = ${XSignature_QR_MPM}`)
        pm.environment.set("Env-X-SIGNATURE", XSignature_QR_MPM);
    }
});