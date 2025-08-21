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

#### execute only one feature file in one folder to CSV or Excel
```
node gherkin2tc_multisheet.js features/login.feature -o output/out.csv
```
```
node gherkin2tc_multisheet.js features/login.feature -o output/out.xlsx --xlsx
```

#### or execute all feature file in one folder to CSV or Excel
```
node gherkin2tc_multisheet.js features -o output/out.csv
```
```
node gherkin2tc_multisheet.js features -o output/out.xlsx --xlsx
```