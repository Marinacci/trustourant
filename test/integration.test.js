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
  for(const file of ['lavoro.html','lavoro.css','lavoro.js','index.html','privacy.html']) assert.equal((await fetch(base+'/'+file)).status,200);
  assert.equal((await fetch(base+'/trustourant-backend.js')).status,404);
  assert.equal((await fetch(base+'/trustourant.db')).status,404);
  const structure=await run("INSERT INTO strutture(nome,tipo,città,provincia,regione,sito_web) VALUES('Hotel Test','hotel','Merano','BZ','Trentino-Alto Adige','https://hotel.example.test')");
  const registration=await fetch(base+'/api/business/registrati',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'direttore@hotel.example.test',password:'local-test-password',struttura_id:structure.lastID})});
  assert.equal(registration.status,200);assert.equal((await registration.json()).verificato,false);
  const oldAccount=await run("INSERT INTO business_accounts(email,password,struttura_id,verificato,metodo_verifica) VALUES('old@example.test','not-a-login',?,1,'dominio_email_automatico')",[structure.lastID]);
  const admin=await run("INSERT INTO users(nome,email,password,is_admin) VALUES('Admin test','admin@example.test','not-a-login',1)");
  const adminHeaders={Authorization:`Bearer ${jwt.sign({userId:admin.lastID},process.env.JWT_SECRET)}`};
  const pending=await (await fetch(base+'/api/admin/business-pending',{headers:adminHeaders})).json();assert.equal(pending.length,2);
  assert.equal((await fetch(base+'/api/admin/business/verifica/'+oldAccount.lastID,{headers:adminHeaders,method:'POST'})).status,200);
  const authorized=await fetch(base+'/api/business/jobs',{headers:{Authorization:`Bearer ${jwt.sign({businessId:oldAccount.lastID},process.env.JWT_SECRET)}`}});assert.equal(authorized.status,200);
  const user=await run("INSERT INTO users(nome,email,password) VALUES('Candidato locale','local@example.test','not-a-login')");
  await run("INSERT INTO job_applications(job_id,user_id,messaggio) VALUES(999,?,'Presentazione locale di prova')",[user.lastID]);
  const headers={Authorization:`Bearer ${jwt.sign({userId:user.lastID},process.env.JWT_SECRET)}`};
  const exported=await fetch(base+'/api/users/me/export',{headers});assert.equal(exported.status,200);
  assert.equal((await exported.json()).candidature.length,1);
  assert.equal((await fetch(base+'/api/users/me',{headers,method:'DELETE'})).status,200);
  const count=await new Promise((resolve,reject)=>db.get('SELECT COUNT(*) AS n FROM job_applications',(err,row)=>err?reject(err):resolve(row.n)));assert.equal(count,0);
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
