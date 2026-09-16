'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');

test('Full backend starts, serves public job files, exports and deletes candidate data',async()=>{
 process.env.DB_PATH=':memory:';process.env.JWT_SECRET='integration-test-only-private-secret';
 require('nodemailer').createTransport=()=>({sendMail:async()=>({})});
 const app=require('../trustourant-backend');await app.jobsReady;
 const db=app.database;
 const run=(sql,params=[])=>new Promise((resolve,reject)=>db.run(sql,params,function(err){err?reject(err):resolve(this);}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
  for(const file of ['lavoro.html','lavoro.css','lavoro-demo.css','lavoro.js','design-system.css','public-home.js','index.html','privacy.html']) assert.equal((await fetch(base+'/'+file)).status,200);
  assert.equal((await fetch(base+'/trustourant-backend.js')).status,404);
  assert.equal((await fetch(base+'/trustourant.db')).status,404);
  const structure=await run("INSERT INTO strutture(nome,tipo,città,provincia,regione,sito_web) VALUES('Hotel Test','hotel','Merano','BZ','Trentino-Alto Adige','https://hotel.example.test')");
  const southTyrol=await run("INSERT INTO strutture(nome,tipo,città,provincia,regione) VALUES('Albergo Centro','hotel','Meran - Merano','BZ','Trentino-Alto Adige/Südtirol')");
  for (const query of ['nome=Merano','regione=Trentino%20Alto%20Adige','regione=Alto%20Adige','regione=Sudtirol']) {
    const found=await (await fetch(base+'/api/strutture?'+query)).json();
    assert.ok(found.some(item=>item.id===structure.lastID || item.id===southTyrol.lastID), `Ricerca non riuscita: ${query}`);
  }
  assert.equal((await (await fetch(base+"/api/strutture?nome='%20OR%201%3D1%20--")).json()).length,0);
  const registration=await fetch(base+'/api/business/registrati',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'direttore@hotel.example.test',password:'local-test-password',struttura_id:structure.lastID})});
  assert.equal(registration.status,200);assert.equal((await registration.json()).verificato,false);
  const resetRequest=await fetch(base+'/api/business/richiedi-reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'direttore@hotel.example.test'})});assert.equal(resetRequest.status,200);
  const businessReset=await new Promise((resolve,reject)=>db.get("SELECT reset_token FROM business_accounts WHERE email='direttore@hotel.example.test'",(err,row)=>err?reject(err):resolve(row)));
  assert.ok(businessReset.reset_token);
  assert.equal((await fetch(base+'/api/business/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:businessReset.reset_token,nuovaPassword:'nuova-password-sicura'})})).status,200);
  const oldAccount=await run("INSERT INTO business_accounts(email,password,struttura_id,verificato,metodo_verifica) VALUES('old@example.test','not-a-login',?,1,'dominio_email_automatico')",[structure.lastID]);
  const admin=await run("INSERT INTO users(nome,email,password,is_admin) VALUES('Admin test','admin@example.test','not-a-login',1)");
  const adminHeaders={Authorization:`Bearer ${jwt.sign({userId:admin.lastID},process.env.JWT_SECRET)}`};
  const pending=await (await fetch(base+'/api/admin/business-pending',{headers:adminHeaders})).json();assert.equal(pending.length,2);
  assert.equal((await fetch(base+'/api/admin/business/verifica/'+oldAccount.lastID,{headers:adminHeaders,method:'POST'})).status,200);
  const authorized=await fetch(base+'/api/business/jobs',{headers:{Authorization:`Bearer ${jwt.sign({businessId:oldAccount.lastID},process.env.JWT_SECRET)}`}});assert.equal(authorized.status,200);
  const reviewOwner=await run("INSERT INTO users(nome,email,password) VALUES('Autore review','autore@example.test','not-a-login')");
  const otherReviewer=await run("INSERT INTO users(nome,email,password) VALUES('Altro autore','altro@example.test','not-a-login')");
  const ownerHeaders={Authorization:`Bearer ${jwt.sign({userId:reviewOwner.lastID,tokenVersion:0},process.env.JWT_SECRET)}`};
  const otherHeaders={Authorization:`Bearer ${jwt.sign({userId:otherReviewer.lastID,tokenVersion:0},process.env.JWT_SECRET)}`};
  const review=await run('INSERT INTO reviews(user_id,struttura_id,rating_medio,moderato) VALUES(?,?,?,1)',[reviewOwner.lastID,structure.lastID,4]);
  await run('UPDATE strutture SET rating=4,num_reviews=1 WHERE id=?',[structure.lastID]);
  assert.equal((await fetch(base+`/api/reviews/${review.lastID}`,{method:'DELETE'})).status,401);
  assert.equal((await fetch(base+`/api/reviews/${review.lastID}`,{method:'DELETE',headers:otherHeaders})).status,404);
  assert.equal((await fetch(base+`/api/reviews/${review.lastID}`,{method:'DELETE',headers:adminHeaders})).status,403);
  assert.equal((await fetch(base+`/api/reviews/${review.lastID}`,{method:'DELETE',headers:ownerHeaders})).status,200);
  const removed=await new Promise((resolve,reject)=>db.get('SELECT id FROM reviews WHERE id=?',[review.lastID],(err,row)=>err?reject(err):resolve(row)));
  assert.equal(removed,undefined);
  const recalculated=await new Promise((resolve,reject)=>db.get('SELECT rating,num_reviews FROM strutture WHERE id=?',[structure.lastID],(err,row)=>err?reject(err):resolve(row)));
  assert.deepEqual(recalculated,{rating:0,num_reviews:0});
  const user=await run("INSERT INTO users(nome,email,password) VALUES('Candidato locale','local@example.test','not-a-login')");
  const job=await run("INSERT INTO jobs(business_id,titolo,descrizione,contratto,salario_min,salario_max,salario_tipo,mensilita,ore_settimana,giorni_settimana) VALUES(?,'Chef test','Descrizione completa della posizione di lavoro.','indeterminato',2500,3000,'netto',13,40,5)",[oldAccount.lastID]);
  await run("INSERT INTO job_applications(job_id,user_id,messaggio) VALUES(?,?,'Presentazione locale di prova')",[job.lastID,user.lastID]);
  const headers={Authorization:`Bearer ${jwt.sign({userId:user.lastID},process.env.JWT_SECRET)}`};
  const exported=await fetch(base+'/api/users/me/export',{headers});assert.equal(exported.status,200);
  assert.equal((await exported.json()).candidature.length,1);
  assert.equal((await fetch(base+'/api/users/me',{headers,method:'DELETE'})).status,200);
  const count=await new Promise((resolve,reject)=>db.get('SELECT COUNT(*) AS n FROM job_applications',(err,row)=>err?reject(err):resolve(row.n)));assert.equal(count,0);
  const blockedOrigin=await fetch(base+'/api/health',{headers:{Origin:'https://attacker.example'}});assert.equal(blockedOrigin.status,403);
 } finally {
  await new Promise(resolve=>server.close(resolve));
  // Let the existing delayed admin initialization finish before closing this test DB.
  await new Promise(resolve=>setTimeout(resolve,550));await new Promise(resolve=>db.close(resolve));
 }
});
test('Startup rejects missing and publicly known JWT signing secrets',()=>{
 for(const secret of ['', 'trustourant-secret-key-change-in-production']){
  const child=spawnSync(process.execPath,['trustourant-backend.js'],{env:{...process.env,JWT_SECRET:secret},encoding:'utf8'});
  assert.notEqual(child.status,0);assert.match(child.stderr,/Imposta JWT_SECRET/);
 }
});
