const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const request = require('supertest');
process.env.NODE_ENV='test';process.env.DB_FILE=path.join(os.tmpdir(),`allmodelai-chat-secure-${process.pid}.sqlite`);process.env.API_KEY='test-key';fs.rmSync(process.env.DB_FILE,{force:true});
const app=require('../app'); let api; let originalFetch;
const upstream=()=>{const encoder=new TextEncoder();return new Response(new ReadableStream({start(controller){controller.enqueue(encoder.encode(`data: ${JSON.stringify({choices:[{delta:{content:'Secure answer'}}]})}\n\ndata: [DONE]\n\n`));controller.close()}}),{status:200})};
describe('secure chat and knowledge API',()=>{
 before(async()=>{api=request.agent(app);await api.post('/api/auth/register').send({name:'Tester',email:'tester@example.com',password:'secret'});originalFetch=global.fetch;global.fetch=async()=>upstream()});
 after(()=>{global.fetch=originalFetch;app.locals.db.close()});
 test('rejects anonymous private requests',async()=>{assert.equal((await request(app).get('/api/chat/history')).status,401);assert.equal((await request(app).post('/api/chat').send({messages:[{role:'user',text:'hello'}]})).status,401)});
 test('ignores a forged email and saves to the signed-in account',async()=>{const response=await api.post('/api/chat').send({model:'gpt',userEmail:'victim@example.com',messages:[{role:'user',text:'hello'}]});assert.equal(response.status,200);assert.match(response.text,/Secure answer/);const history=await api.get('/api/chat/history');assert.equal(history.body.length,1);assert.equal(history.body[0].email,'tester@example.com')});
 test('explains Smart Router decisions',async()=>{const response=await api.post('/api/router/preview').send({prompt:'Debug this React function',routerMode:'balanced'});assert.equal(response.status,200);assert.equal(response.body.model,'deepseek');assert.equal(response.body.category,'coding')});
 test('searches saved knowledge',async()=>{await api.post('/api/workspace').send({type:'document',name:'Launch plan',content:'The Aurora launch date is October 12 and the owner is Maya.'});const response=await api.post('/api/knowledge/search').send({query:'When is the Aurora launch?'});assert.equal(response.status,200);assert.equal(response.body.results[0].name,'Launch plan')});
});
