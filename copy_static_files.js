let fs = require('fs');
let mkdirp = require('mkdirp');
let getDirName = require('path').dirname;

let copy = [
    { from: './src/css/worldmap.dark.css', to: './dist/css/worldmap.dark.css' },
    { from: './src/css/worldmap.light.css', to: './dist/css/worldmap.light.css' },
];

copy.forEach(path => {
    let dir = getDirName(path.to);
    if (!fs.existsSync(dir)) {
        mkdirp(dir, function (err) {
            if (err) return cb(err);
        });
    }
    fs.createReadStream(path.from).pipe(fs.createWriteStream(path.to));
});
