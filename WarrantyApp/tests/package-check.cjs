const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),archive=process.argv[2]||path.join(root,'dist','win-unpacked','resources','app.asar');
const packageData=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(packageData.version,'1.1.0');
let checked=0;
function checkDir(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name);if(entry.isDirectory())checkDir(full);else {const relative=path.relative(root,full);assert(fs.readFileSync(full).equals(asar.extractFile(archive,relative)),`Stale or missing packaged file: ${relative}`);checked++;}}}
checkDir(path.join(root,'www'));assert(fs.readFileSync(path.join(root,'main.js')).equals(asar.extractFile(archive,'main.js')));
const paths=asar.listPackage(archive).map(p=>p.replaceAll('\\','/'));assert(!paths.some(p=>/^\/?(tests|backups|artifacts)\//.test(p)),'QA or backups included in release');
console.log(JSON.stringify({passed:true,version:packageData.version,verifiedWebAssets:checked,mainMatches:true,qaExcluded:true}));
