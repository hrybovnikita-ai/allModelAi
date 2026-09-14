const generateImage = async (req, res) => {
    const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt || prompt.length > 4000) return res.status(400).json({ message: 'Опишите изображение: от 1 до 4000 символов.' });
    const keys = [process.env.IMAGE_API_KEY, process.env.OPENAI_API_KEY, process.env.OPEN_AI_API_KEY, process.env.API_IMAGE_KEY]
        .map(value => String(value || '').trim()).filter(Boolean);
    const apiKey = process.env.IMAGE_API_URL ? keys[0] : keys.find(value => /^sk-/i.test(value) && !/^sk-or-/i.test(value));
    const account = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const cloudflareKey = String(process.env.CLOUDFLARE_API_KEY || process.env.CLAUDEFLARE_API_KEY || process.env.API_IMAGE_KEY || '').trim();
    const cloudflare = process.env.IMAGE_PROVIDER === 'cloudflare' || (!apiKey && account && cloudflareKey);
    if (cloudflare ? !account || !cloudflareKey : !apiKey) {
        return res.status(503).json({ message: cloudflare
            ? 'Для Cloudflare укажите CLOUDFLARE_ACCOUNT_ID и CLOUDFLARE_API_KEY на сервере.'
            : 'Добавьте IMAGE_API_KEY для генерации или настройте Cloudflare на сервере.' });
    }
    try {
        const response = await fetch(cloudflare
            ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${process.env.CLOUDFLARE_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell'}`
            : process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations', {
            method: 'POST',
            signal: AbortSignal.timeout(180000),
            headers: { Authorization: `Bearer ${cloudflare ? cloudflareKey : apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(cloudflare ? { prompt: prompt.slice(0, 2048), steps: 4 } : {
                model: process.env.IMAGE_MODEL || 'gpt-image-1', prompt, size: process.env.IMAGE_SIZE || '1024x1024', n: 1,
            }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.success === false) {
            const message = response.status === 401 || response.status === 403
                ? 'Сервис отклонил ключ генерации. Проверьте ключ и доступ к модели в настройках сервиса.'
                : response.status === 429
                    ? 'Лимит сервиса генерации исчерпан. Проверьте баланс или повторите позже.'
                    : 'Сервис не смог создать изображение. Попробуйте изменить описание или повторить позже.';
            return res.status(response.status === 429 ? 429 : 502).json({ message });
        }
        const image = data?.data?.[0];
        const base64 = cloudflare ? data?.result?.image : image?.b64_json;
        const imageUrl = base64 ? `data:image/${cloudflare ? 'jpeg' : 'png'};base64,${base64}` : image?.url;
        if (typeof imageUrl !== 'string' || !/^(https:\/\/|data:image\/(png|jpeg|webp);base64,)/.test(imageUrl)) {
            return res.status(502).json({ message: 'Сервис не вернул изображение. Попробуйте ещё раз.' });
        }
        return res.json({ imageUrl, prompt });
    } catch (error) {
        return res.status(error.name === 'TimeoutError' ? 504 : 502).json({ message: error.name === 'TimeoutError'
            ? 'Генерация заняла слишком много времени. Попробуйте ещё раз.'
            : 'Не удалось подключиться к сервису генерации изображений.' });
    }
};
module.exports = { generateImage };
