### Prerequisite
- Node.js LTS v22.14.0  
- Microsoft Excel
- Visual Studio Code

### 1) Clone this repo to your local

### 2) Open the project using VS Code

### 3) Open terminal and type
```
npm install
```

### 4) Guide to Execute Gherkin File
```
node gherkin2csv.js path/to/file.feature -o out.csv
```
### or execute all feature file in one folder to CSV
```
node gherkin2csv.js path/to/features/ -o out.csv
```

### or execute all feature file in one folder to Excel
```
node gherkin2csv.js path/to/features -o out.xlsx --xlsx
```