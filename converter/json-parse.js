// Sudah langsung OBJECT
const obj = require('../data-test/file-test.json');

// Jadikan one-line string
const oneLine = JSON.stringify(obj);
console.log(oneLine);

// Parse balik ke object dengan pretty (opsional)
const backParse = JSON.stringify(JSON.parse(oneLine), null, 2);
console.log(backParse);