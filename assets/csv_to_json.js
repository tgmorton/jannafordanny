const fs = require('fs');

const csvFile = process.argv[2] || 'videos.csv';
const jsonFile = process.argv[3] || 'videos.json';

const csv = fs.readFileSync(csvFile, 'utf8');
const lines = csv.trim().split('\n');
const headers = lines[0].split(',');

const data = lines.slice(1).map(line => {
  const values = line.split(',');
  return headers.reduce((obj, header, i) => {
    obj[header] = values[i];
    return obj;
  }, {});
});

fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2));
console.log(`Converted ${csvFile} to ${jsonFile}`);
