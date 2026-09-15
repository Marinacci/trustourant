'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const installJobs = require('../jobs');
const secret = 'local-test-secret-not-for-production';
const db = new sqlite3.Database(':memory:');
const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(err){err?reject(err):resolve(this);}));
let server, base, jobId, applicationId;
const worker=jwt.sign({userId:1},secret), otherWorker=jwt.sign({userId:2},secret);
const business=jwt.sign({businessId:1},secret), otherBusiness=jwt.sign({businessId:2},secret), unverified=jwt.sign({businessId:3},secret);
const valid={titolo:'Sous chef',descrizione:'Cucina mediterranea, turno unico serale, due giorni liberi.',contratto:'indeterminato',salario_min:3000,salario_max:3500,salario_tipo:'netto',mensilita:14,ore_settimana:40,giorni_settimana:5,alloggio:true};
async function request(path,{token,method='GET',body}={}){
 const res=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 return {status:res.status,data:await res.json()};
}
before(async()=>{
 await run('CREATE TABLE users(id INTEGER PRIMARY KEY,nome TEXT,email TEXT,bannato INTEGER DEFAULT 0)');
 await run('CREATE TABLE strutture(id INTEGER PRIMARY KEY,nome TEXT,città TEXT,provincia TEXT,tipo TEXT,bloccata INTEGER DEFAULT 0)');
 await run('CREATE TABLE business_accounts(id INTEGER PRIMARY KEY,struttura_id INTEGER,verificato INTEGER,metodo_verifica TEXT)');
 await run("INSERT INTO users(id,nome,email) VALUES(1,'Candidato','candidato@example.test'),(2,'Altro','altro@example.test')");
 await run("INSERT INTO strutture(id,nome,città,provincia,tipo) VALUES(1,'Hotel Uno','Merano','BZ','hotel'),(2,'Hotel Due','Bolzano','BZ','hotel')");
 await run("INSERT INTO business_accounts VALUES(1,1,1,'verifica_manuale_admin'),(2,2,1,'verifica_manuale_admin'),(3,1,1,'dominio_email_automatico')");
 const app=express();app.use(express.json());await installJobs(app,db,{jwt,secret}).ready;
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>db.close(resolve));});
test('Public jobs initially empty; missing and wrong-role authentication rejected',async()=>{
 assert.deepEqual((await request('/jobs')).data.jobs,[]);
 assert.equal((await request('/business/jobs',{method:'POST',body:valid})).status,401);
 assert.equal((await request('/business/jobs',{token:worker,method:'POST',body:valid})).status,401);
 assert.equal((await request('/business/jobs',{token:unverified,method:'POST',body:valid})).status,403);
});
test('Salary and working conditions validated on server',async()=>{
 for(const body of [{...valid,salario_min:undefined},{...valid,salario_max:2000},{...valid,salario_tipo:'circa'},{...valid,ore_settimana:0},{...valid,giorni_settimana:7},{...valid,alloggio:'true'}])
  assert.equal((await request('/business/jobs',{token:business,method:'POST',body})).status,400);
 const result=await request('/business/jobs',{token:business,method:'POST',body:valid});assert.equal(result.status,201);jobId=result.data.id;
});
test('Filters preserve net/gross meaning, pagination, literal search and no contact leak',async()=>{
 let result=await request('/jobs?q=chef&luogo=Merano&salario_min=2500&salario_tipo=netto&alloggio=1');assert.equal(result.data.total,1);assert.equal(result.data.jobs[0].struttura_nome,'Hotel Uno');assert.ok(!JSON.stringify(result.data).includes('@'));
 assert.equal((await request('/jobs?salario_min=2500&salario_tipo=lordo')).data.total,0);
 assert.equal((await request('/jobs?salario_min=2500')).status,400);
 assert.equal((await request('/jobs?page=-1')).status,400);
 assert.equal((await request('/jobs?q=%25')).data.total,0);
 assert.equal((await request('/jobs?luogo=Roma')).data.total,0);
});
test('Consent required; duplicate applications rejected; only owner sees candidates',async()=>{
 const body={messaggio:'Sono un sous chef con dieci anni di esperienza.',consenso:true};
 assert.equal((await request(`/jobs/${jobId}/applications`,{token:business,method:'POST',body})).status,401);
 assert.equal((await request(`/jobs/${jobId}/applications`,{token:worker,method:'POST',body:{...body,consenso:false}})).status,400);
 assert.equal((await request(`/jobs/${jobId}/applications`,{token:worker,method:'POST',body})).status,201);
 assert.equal((await request(`/jobs/${jobId}/applications`,{token:worker,method:'POST',body})).status,409);
 assert.equal((await request(`/business/jobs/${jobId}/applications`,{token:otherBusiness})).status,404);
 const candidates=await request(`/business/jobs/${jobId}/applications`,{token:business});assert.equal(candidates.data[0].email,'candidato@example.test');
 const own=await request('/me/applications',{token:worker});applicationId=own.data[0].id;
 assert.equal((await request('/me/applications',{token:otherWorker})).data.length,0);
 assert.equal((await request(`/me/applications/${applicationId}`,{token:otherWorker,method:'DELETE'})).status,404);
});
test('Verification revocation and blocked businesses hide jobs and candidate lists',async()=>{
 await run('UPDATE business_accounts SET verificato=0 WHERE id=1');
 assert.equal((await request('/jobs')).data.total,0);
 assert.equal((await request(`/business/jobs/${jobId}/applications`,{token:business})).status,403);
 await run('UPDATE business_accounts SET verificato=1 WHERE id=1');await run('UPDATE strutture SET bloccata=1 WHERE id=1');
 assert.equal((await request('/jobs')).data.total,0);
 await run('UPDATE strutture SET bloccata=0 WHERE id=1');
});
test('Withdrawal deletes application; account deletion also removes applications',async()=>{
 assert.equal((await request(`/me/applications/${applicationId}`,{token:worker,method:'DELETE'})).status,200);
 assert.equal((await request(`/business/jobs/${jobId}/applications`,{token:business})).data.length,0);
 await request(`/jobs/${jobId}/applications`,{token:otherWorker,method:'POST',body:{messaggio:'Disponibile per lavorare in cucina da subito.',consenso:true}});
 await run('DELETE FROM users WHERE id=2');
 const row=await new Promise((resolve,reject)=>db.get('SELECT COUNT(*) AS n FROM job_applications',(err,r)=>err?reject(err):resolve(r)));assert.equal(row.n,0);
});
test('Closed or expired jobs cannot receive applications and another business cannot close them',async()=>{
 assert.equal((await request(`/business/jobs/${jobId}/close`,{token:otherBusiness,method:'PATCH'})).status,404);
 await run("UPDATE jobs SET scadenza=datetime('now','-1 day') WHERE id=?",[jobId]);
 assert.equal((await request(`/jobs/${jobId}`)).status,404);
 assert.equal((await request(`/jobs/${jobId}/applications`,{token:worker,method:'POST',body:{messaggio:'Disponibile per lavorare in cucina da subito.',consenso:true}})).status,404);
 await run("UPDATE jobs SET scadenza=datetime('now','+60 days') WHERE id=?",[jobId]);
 assert.equal((await request(`/business/jobs/${jobId}/close`,{token:business,method:'PATCH'})).status,200);
 assert.equal((await request('/jobs')).data.total,0);
 assert.equal((await request(`/jobs/${jobId}/applications`,{token:worker,method:'POST',body:{messaggio:'Disponibile per lavorare in cucina da subito.',consenso:true}})).status,404);
});
