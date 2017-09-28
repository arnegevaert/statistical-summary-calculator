const n3 = require('n3');
const fs = require('fs');

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

