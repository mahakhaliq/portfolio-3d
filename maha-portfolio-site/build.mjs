import {readdir, readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import path from 'node:path';

const assets = Object.create(null);
async function collect(dir) {
    for (const entry of await readdir(dir, {withFileTypes:true})) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await collect(file);
        else {
            const key = '/' + path.relative('public',file).split(path.sep).join('/');
            assets[key] = (await readFile(file)).toString('base64');
        }
    }
}

const handler = `
const types = {html:'text/html;charset=utf-8',js:'text/javascript',wav:'audio/wav',png:'image/png',jpg:'image/jpeg',mp4:'video/mp4'};
export default {
    async fetch(request, env) {
        const pathname = new URL(request.url).pathname;
        if (/^\\/project-videos\\/[a-z-]+\\.mp4$/.test(pathname)) return serveProjectVideo(request, env, pathname.split('/').pop());
        if (pathname === '/api/chat') return chat(request,env);
        const name = pathname === '/' ? '/index.html' : pathname;
        if (!Object.hasOwn(assets,name)) return new Response('Not found',{status:404});
        const bytes = Uint8Array.from(atob(assets[name]),character => character.charCodeAt(0));
        const extension = name.split('.').pop();
        const headers = new Headers({'Content-Type':types[extension] || 'application/octet-stream'});
        let body = bytes;
        let status = 200;
        if (extension === 'mp4') {
            headers.set('Accept-Ranges','bytes');
            const range = request.headers.get('Range');
            if (range) {
                const match = /^bytes=(\\d*)-(\\d*)$/.exec(range);
                const start = match?.[1] ? Number(match[1]) : Math.max(0,bytes.length-Number(match?.[2]));
                const end = match?.[1] && match[2] ? Math.min(bytes.length-1,Number(match[2])) : bytes.length-1;
                if (!match || !Number.isSafeInteger(start) || start > end || start >= bytes.length) {
                    headers.set('Content-Range','bytes */'+bytes.length);
                    return new Response(null,{status:416,headers});
                }
                headers.set('Content-Range','bytes '+start+'-'+end+'/'+bytes.length);
                body = bytes.subarray(start,end+1);
                status = 206;
            }
        }
        headers.set('Content-Length',String(body.length));
        return new Response(request.method === 'HEAD' ? null : body,{status,headers});
    },
};
`;

await collect('public');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
await writeFile('dist/server/index.js',(await readFile('chat-source.js','utf8'))+'\n'+(await readFile('project-video-source.js','utf8'))+'\nconst assets='+JSON.stringify(assets)+';\n'+handler);

