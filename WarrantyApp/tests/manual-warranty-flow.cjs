// Local Firebase fixture only; external requests are blocked.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const www=path.resolve(__dirname,'../www'),sdk=fs.readFileSync(path.join(__dirname,'firebase-fixture.js'),'utf8');
const now=Date.now(),seed={
 'warrantyCards/manual':{customerName:'Manual Test',saleType:'manual',certNo:'GAR-MANUAL',createdAt:{$ms:now-86400000},warrantyUntil:{$ms:now+8640000000},items:[{name:'Same Model',serialNumber:'',sourceItemIndex:null},{name:'Same Model',serialNumber:'',sourceItemIndex:null}]},
 'warrantyCards/old-single':{customerName:'Legacy Test',saleType:'manual',certNo:'GAR-SINGLE',createdAt:{$ms:now-86400000},warrantyUntil:{$ms:now+8640000000},items:[{name:'Old Model',serialNumber:''}]},
 'serviceTickets/old-ticket':{customerName:'Legacy Test',productName:'Old Model',warrantyCardId:'old-single',serialNumber:'',status:'received',createdAt:{$ms:now},timeline:[]}
};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const target=path.resolve(www,'.'+new URL(req.url,'http://localhost').pathname);if(!target.startsWith(www+path.sep))return res.writeHead(403).end();fs.readFile(target,(error,body)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(error?'Missing':body);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext();
 await context.addInitScript(value=>{window.__seed=JSON.parse(sessionStorage.getItem('manual-regression')||'null')||value;},seed);
 await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith('https://www.gstatic.com/firebasejs/'))return route.fulfill({status:200,contentType:'text/javascript',body:sdk});return url.startsWith(base)||url.startsWith('data:')?route.continue():route.abort();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const retain=()=>page.evaluate(()=>{function plain(v){if(v?.toMillis)return {$ms:v.toMillis()};if(Array.isArray(v))return v.map(plain);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,value])=>[k,plain(value)]));return v;}sessionStorage.setItem('manual-regression',JSON.stringify(plain(window.__mock.records)));});
 try{
  await page.goto(`${base}/claim.html?cardId=manual&itemIndex=1`);await page.locator('#issue-text').waitFor({state:'visible'});
  await page.locator('#issue-text').fill('Second manual machine without serial.');await page.locator('#submit-claim-btn').click();await page.getByRole('dialog').getByRole('button',{name:'Konfirmo dhe regjistro',exact:true}).click();await page.locator('#claimed-panel').waitFor({state:'visible'});
  const created=await page.evaluate(()=>window.__mock.writes.find(w=>w.path.startsWith('serviceTickets/')));assert.equal(created.data.warrantyCardId,'manual');assert.equal(created.data.warrantyCardItemIndex,1);await retain();
  await page.goto(`${base}/pending-detail.html?id=${created.path.split('/')[1]}`);await page.locator('#service-form').waitFor();
  const passport=page.locator('a[href^="machines.html?"]');assert((await passport.getAttribute('href')).includes('itemIndex=1'));
  assert(!(await page.locator('.dg-facts').innerText()).includes('Pa garanci të lëshuar'));
  await page.locator('#status').selectOption('completed');await page.locator('#save-service').click();await page.getByRole('dialog').getByRole('button',{name:'Ruaj ndryshimet',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('save-status')?.textContent.includes('ruajtën'));
  const saved=await page.evaluate(()=>window.__mock.records);assert.equal(Object.keys(saved).filter(k=>k.startsWith('warrantyCards/')).length,2);assert.equal(saved['warrantyCards/manual'].repairs[0].ticketId,created.path.split('/')[1]);assert.equal(saved[created.path].warrantyCardItemIndex,1);await retain();
  await page.goto(`${base}/machines.html?cardId=manual&itemIndex=1`);await page.locator('.mp-history').waitFor();assert((await page.locator('.mp-history').innerText()).includes('Second manual machine without serial.'));
  await page.goto(`${base}/machines.html?cardId=manual&itemIndex=0`);await page.locator('.mp-history').waitFor();assert(!(await page.locator('.mp-history').innerText()).includes('Second manual machine without serial.'));
  await page.goto(`${base}/pending-detail.html?id=old-ticket`);await page.locator('#service-form').waitFor();assert(!(await page.locator('.dg-facts').innerText()).includes('Pa garanci të lëshuar'));
  await page.locator('#status').selectOption('completed');await page.locator('#save-service').click();await page.getByRole('dialog').getByRole('button',{name:'Ruaj ndryshimet',exact:true}).click();await page.waitForFunction(()=>window.__mock.records['warrantyCards/old-single'].repairs?.length===1);assert.equal(await page.evaluate(()=>window.__mock.records['serviceTickets/old-ticket'].warrantyCardItemIndex),0);
  assert.deepEqual(errors,[]);console.log('PASS: manual multi-item claims without serial retain exact certificate item through detail, completion and passport; legacy single-item links remain supported.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
