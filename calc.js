const n3 = require('n3');
const fs = require('fs');
const ss = require('simple-statistics');

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

let dayToGraph = {};
let measurements = [];
let currentDay = undefined;
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
            if (currentDay === undefined) {
                currentDay = day;
                dayToGraph[day] = [];
            } else if (dayToGraph[day] === undefined) {
                dayToGraph[day] = [];
                endedDay = true;
            }
            dayToGraph[day].push(triple.subject);
        } else if (triple.predicate === 'http://vocab.datex.org/terms#parkingNumberOfVacantSpaces') {
            measurements.push(triple);
        }
    });

    // We encountered the end of a day, summarize it and throw away the data
    // Note that we assume here that at most 1 day can be ended in a file (so files are smaller than 1 day)
    if (endedDay) {
        const graphs = dayToGraph[currentDay];
        delete dayToGraph[currentDay];

        let currentMeasurements = {};
        let otherMeasurements = [];
        measurements.forEach(meas => {
            if (graphs.includes(meas.graph)) {
                if (currentMeasurements[meas.subject] === undefined) {
                    currentMeasurements[meas.subject] = [];
                }
                currentMeasurements[meas.subject].push(parseInt(n3.Util.getLiteralValue(meas.object)));
            } else {
                otherMeasurements.push(meas);
            }
        });
        measurements = otherMeasurements;



        let writer = n3.Writer({prefixes: {stat: 'http://datapiloten.be/vocab/timeseries#'}});
        Object.keys(currentMeasurements).forEach(parking => {
            let data = currentMeasurements[parking];
            let stats = {};
            stats.mean = ss.mean(data);
            stats.median = ss.median(data);
            stats.firstQuartile = ss.quantile(data, 0.25);
            stats.thirdQuartile = ss.quantile(data, 0.75);
            stats.variance = ss.variance(data);
            Object.keys(stats).forEach(key => {
                let stat = stats[key];
                writer.addTriple({
                    'subject': parking,
                    'predicate': 'stat:' + key,
                    'object': n3.Util.createLiteral(stat)
                });
            });
        });
        writer.end((error, result) => {
            // Write result to file// Build path
            let path = out_dir;
            if (path[path.length-1] !== '/') path += '/';
            path += currentDay;
            fs.writeFileSync(path, result);
        });

        currentDay = undefined;
    }
});