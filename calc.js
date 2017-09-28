const n3 = require('n3');
const fs = require('fs');
const moment = require('moment');

if (process.argv.length !== 4) {
    console.error('Usage: node calc.js INPUT OUTPUT');
    process.exit(1);
}

const in_dir = process.argv[2];
const out_dir = process.argv[3];

[in_dir, out_dir].forEach(dir => {
    fs.statSync(dir, (err, stats) => {
        if (err) {
            console.error('Could not access directory.' + in_dir + ' Check if it exists.');
            process.exit(2);
        }
        if (!stats.isDirectory()) {
            console.error(in_dir + ' is not a directory.');
            process.exit(3);
        }
    });
});

const filenames = fs.readdirSync(in_dir).sort();
const parser = n3.Parser();

const dayToGraph = {};
const measurements = [];
let firstDay = true;
filenames.forEach(file => {
    let endedDay = false;

    // Build path
    let path = in_dir;
    if (path[path.length-1] !== '/') path += '/';
    path += file;

    // Read and parse
    const raw = fs.readFileSync(path, 'utf8');
    const triples = parser.parse(raw);

    // Divide into measurements and generatedAt
    triples.forEach(triple => {
        if (triple.predicate === 'http://www.w3.org/ns/prov#generatedAtTime') {
            let day = n3.Util.getLiteralValue(triple.object).substring(0, 10);
            if (dayToGraph[day] === undefined) {
                dayToGraph[day] = [];
                if (!firstDay) {
                    endedDay = true;
                }
                firstDay = false;
            }
            dayToGraph[day].push(triple.subject);
        } else if (triple.predicate === 'datex:parkingNumberOfVacantSpaces') {
            measurements.push(triple);
        }
    });

    // We encountered the end of a day, summarize it and throw away the data
    if (endedDay) {

    }
});

console.log(JSON.stringify(dayToGraph), undefined, 2);