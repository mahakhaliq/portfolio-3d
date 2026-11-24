const projectVideos = new Set(["living-jungle.mp4", "portal-breach.mp4", "signal-shutdown.mp4", "unbreakable-oath.mp4", "vr-encanto.mp4", "vr-escape-room.mp4"]);
async function serveProjectVideo(request, env, filename) {
    if (!projectVideos.has(filename)) return new Response(null, {status:404});
    const store = env.PROJECT_MEDIA;
    if (!store) return new Response('Video unavailable', {status:404});
    const key = 'projects/' + filename;
    const metadata = await store.head(key);
    if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405});
    if (!metadata) return new Response('Video unavailable', {status:404});
    const headers = new Headers({'Content-Type':'video/mp4','Accept-Ranges':'bytes','ETag':metadata.httpEtag,'Cache-Control':'public, max-age=3600'});
    let range;
    const raw = request.headers.get('range');
    if (raw) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(raw);
        const start = m?.[1] ? Number(m[1]) : Math.max(0,metadata.size-Number(m?.[2]));
        const end = m?.[1] && m[2] ? Math.min(metadata.size-1,Number(m[2])) : metadata.size-1;
        if (!m || (!m[1] && !m[2]) || !Number.isSafeInteger(start) || start>end || start>=metadata.size) {
            headers.set('Content-Range','bytes */'+metadata.size);
            return new Response(null,{status:416,headers});
        }
        headers.set('Content-Range','bytes '+start+'-'+end+'/'+metadata.size);
        range = {offset:start,length:end-start+1};
    }
    headers.set('Content-Length',String(range?.length ?? metadata.size));
    if (request.method === 'HEAD') return new Response(null,{status:range?206:200,headers});
    const object = await store.get(key, range ? {range} : undefined);
    return object ? new Response(object.body,{status:range?206:200,headers}) : new Response(null,{status:404});
}
