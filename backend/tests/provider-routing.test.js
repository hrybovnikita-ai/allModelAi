const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `allmodelai-providers-${process.pid}-${Date.now()}.sqlite`);
process.env.DEVELOPER_EMAILS = 'providers@example.com';
process.env.API_KEY = 'test-gateway';
const app = require('../app');
const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; app.locals.db.close(); });
test('routes international Kimi and gateway Grok with their own credentials', async () => {
    const api = request.agent(app);
    await api.post('/api/auth/register').send({name:'Provider Test', email:'providers@example.com', password:'test-password'});
    const cases = [
        {model:'kimi', variant:'k2', env:{KIMI_API_KEY:'test-kimi', KIMI_PROVIDER:'openrouter'}, url:'https://openrouter.ai/api/v1/chat/completions', key:'test-gateway', upstream:'moonshotai/kimi-k2'},
        {model:'kimi', variant:'k2.5', env:{KIMI_API_KEY:'test-kimi', KIMI_PROVIDER:'openrouter'}, url:'https://openrouter.ai/api/v1/chat/completions', key:'test-gateway', upstream:'moonshotai/kimi-k2.5'},
        {model:'kimi', variant:'k2', env:{KIMI_API_KEY:'test-kimi', KIMI_BASE_URL:'https://api.moonshot.ai/v1/'}, url:'https://api.moonshot.ai/v1/chat/completions', key:'test-kimi', upstream:'kimi-k2-0711-preview'},
        {model:'grok', variant:'4.3', env:{XAI_API_KEY:'test-xai', GROK_PROVIDER:'openrouter'}, url:'https://openrouter.ai/api/v1/chat/completions', key:'test-gateway', upstream:'x-ai/grok-4.3'},
    ];
    for (const c of cases) {
        const previous = Object.fromEntries(Object.keys(c.env).map(k => [k, process.env[k]]));
        Object.assign(process.env, c.env);
        let called = false;
        global.fetch = async (url, options) => {
            called = true;
            assert.equal(url, c.url);
            assert.equal(options.headers.Authorization, `Bearer ${c.key}`);
            assert.equal(JSON.parse(options.body).model, c.upstream);
            return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n', {status:200});
        };
        try {
            const response = await api.post('/api/chat').send({model:c.model, variant:c.variant, temporary:true, messages:[{role:'user',text:'hello'}]});
            assert.equal(response.status, 200, response.text);
            assert.equal(called, true);
            assert.match(response.text, /OK/);
        } finally {
            for (const [key, value] of Object.entries(previous)) {
                if (value === undefined) delete process.env[key]; else process.env[key] = value;
            }
        }
    }
});

test('billing errors do not expose upstream account identifiers', async () => {
    const api=request.agent(app);
    await api.post('/api/auth/login').send({email:'providers@example.com',password:'test-password'});
    global.fetch=async()=>new Response(JSON.stringify({error:{message:'Your account org-private <ak-private> is suspended due to insufficient balance, please recharge'}}),{status:429,headers:{'Content-Type':'application/json'}});
    try {
        const response=await api.post('/api/chat').send({model:'kimi',variant:'k2',temporary:true,messages:[{role:'user',text:'hello'}]});
        assert.equal(response.status,429);
        assert.match(response.body.message,/insufficient balance or quota/);
        assert.doesNotMatch(response.text,/org-private|ak-private/);
    } finally {global.fetch=originalFetch;}
});
