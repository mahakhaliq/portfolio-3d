import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import worker from './maha-portfolio-site/dist/server/index.js';

try {
    process.loadEnvFile(fileURLToPath(new URL('./.env.local',import.meta.url)));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

function videoPath(key) {
    return fileURLToPath(new URL('./maha-project-media/dist/'+key.slice('projects/'.length), import.meta.url));
}
const localMedia = {
    async head(key) {
        try {
            const info = await stat(videoPath(key));
            return {size:info.size,httpEtag:'"'+info.size+'-'+Math.trunc(info.mtimeMs)+'"'};
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            return null;
        }
    },
    async get(key, options) {
        const file = videoPath(key);
        const range = options?.range;
        const stream = range
            ? createReadStream(file,{start:range.offset,end:range.offset+range.length-1})
            : createReadStream(file);
        return {body:Readable.toWeb(stream)};
    },
};

http.createServer(async (req,res) => {
    try {
        if (!['GET','HEAD','POST'].includes(req.method)) { res.writeHead(405);res.end();return; }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
            size += chunk.length;
            if (size > 4096) { res.writeHead(413);res.end();return; }
            chunks.push(chunk);
        }
        const request = new Request('http://'+req.headers.host+req.url,{
            method:req.method,
            headers:req.headers,
            body:chunks.length ? Buffer.concat(chunks) : undefined,
        });
        const response = await worker.fetch(request,{...process.env,PROJECT_MEDIA:localMedia});
        res.writeHead(response.status,Object.fromEntries(response.headers));
        if (response.body) await pipeline(Readable.fromWeb(response.body),res);
        else res.end();
    } catch {
        if (!res.headersSent) res.writeHead(400);
        res.end();
    }
}).listen(8139,'127.0.0.1');

