const n3 = require('n3');
const fs = require('fs');
const ss = require('simple-statistics');
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

let dayToGraph = {};
let graphToGenTime = {};
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
            graphToGenTime[triple.graph] = triple.object;
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

        let beginning, ending = undefined;
        graphs.forEach(graph => {
            let gentime = moment(n3.Util.getLiteralValue(graphToGenTime[graph]));
            if (beginning === undefined || gentime < beginning) {
                beginning = gentime;
            }
            if (ending === undefined || gentime > ending) {
                ending = gentime;
            }
        });

        let prefixes = {
            ts: 'http://datapiloten.be/vocab/timeseries#',
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            time: 'https://www.w3.org/TR/owl-time/',
            datex: 'http://vocab.datex.org/terms#'
        };
        let writer = n3.Writer({prefixes: prefixes});
        let summIndex = 0;
        Object.keys(currentMeasurements).forEach(parking => {
            let data = currentMeasurements[parking];
            let subject = '#summary' + summIndex;
            let stats = {};
            stats.mean = ss.mean(data);
            stats.median = ss.median(data);
            stats.firstQuartile = ss.quantile(data, 0.25);
            stats.thirdQuartile = ss.quantile(data, 0.75);
            stats.variance = ss.variance(data);

            writer.addTriple(subject, 'rdf:type', 'ts:Summary');
            writer.addTriple(subject, 'rdf:predicate', 'datex:numberOfVacantSpaces');
            writer.addTriple(subject, 'rdf:subject', parking);
            writer.addTriple(subject, 'time:hasBeginning', n3.Util.createLiteral(beginning, 'http://www.w3.org/2001/XMLSchema#dateTime'));
            writer.addTriple(subject, 'time:hasEnd', n3.Util.createLiteral(ending, 'http://www.w3.org/2001/XMLSchema#dateTime'));

            Object.keys(stats).forEach(key => {
                let stat = stats[key];
                writer.addTriple(subject, 'ts:' + key, n3.Util.createLiteral(stat));
            });
            summIndex++;
        });

        writer.end((error, result) => {
            let path = out_dir;
            if (path[path.length-1] !== '/') path += '/';
            path += currentDay;
            fs.writeFileSync(path, result);
        });

        currentDay = undefined;
    }
});