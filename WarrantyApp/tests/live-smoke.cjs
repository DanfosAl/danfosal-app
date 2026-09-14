// Read-only Electron verification. Database commit endpoints are blocked.
const { _electron:electron }=require('playwright');
const path=require('path'),fs=require('fs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),installed=process.argv.includes('--installed'),out=path.join(root,'artifacts','qa');
const exe=installed?path.join(process.env.LOCALAPPDATA,'Programs','Danfos Garanci','Danfos Garanci.exe'):path.join(root,'node_modules','electron','dist','electron.exe');
(async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:exe,args:[...(installed?[]:[root]),`--user-data-dir=${path.join(out,installed?'installed-profile':'live-profile')}`],cwd:root,env,timeout:60000});
 const blocked=[];await app.context().route(/firestore.googleapis.com\/.*(?:Commit|Write|:commit|:batchWrite)/,route=>{blocked.push(route.request().url());route.abort();});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.waitForFunction(()=>document.getElementById('open-count')?.textContent.match(/^\d+$/),{},{timeout:45000});
  const startUrl=page.url();const checks=[];
  for(const name of installed?['index','machines']:['index','pending','machines','schedule','analytics','issue','claim']){
   await page.goto(startUrl.replace(/index\.html.*$/,`${name}.html`));
   await page.waitForFunction(()=>document.querySelector('[data-connection="connected"]'),{},{timeout:45000});
   const failure=await page.locator('#page-error:not([hidden]),#analytics-error:not([hidden])').count();assert.equal(failure,0,`${name} data load failed`);
   await page.screenshot({path:path.join(out,`${installed?'installed':'live'}-${name}.png`),fullPage:true});checks.push(name);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const version=await app.evaluate(({app})=>app.getVersion());assert.equal(version,'1.1.0');
  fs.writeFileSync(path.join(out,installed?'installed-results.json':'live-results.json'),JSON.stringify({passed:true,version,pages:checks,databaseWrites:0},null,2));console.log(JSON.stringify({passed:true,version,pages:checks,databaseWrites:0}));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
