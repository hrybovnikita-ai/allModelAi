/** In-process pub/sub for background job SSE subscribers (single-instance workers). */

const subscribers = new Map();

function subscribe(jobId, listener) {
    const key = String(jobId || '');
    if (!key) return () => {};
    let set = subscribers.get(key);
    if (!set) {
        set = new Set();
        subscribers.set(key, set);
    }
    set.add(listener);
    return () => {
        set.delete(listener);
        if (!set.size) subscribers.delete(key);
    };
}

function publish(jobId, payload) {
    const key = String(jobId || '');
    const set = subscribers.get(key);
    if (!set?.size) return;
    for (const listener of set) {
        try {
            listener(payload);
        } catch {
            /* ignore listener errors */
        }
    }
}

module.exports = {
    subscribe,
    publish,
};
