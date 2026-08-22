import { Buffer } from 'node:buffer';

export interface Env {
    DB: D1Database;
    GITHUB_USER: string;
    GITHUB_REPO: string;
    GITHUB_BRANCH: string;
    GITHUB_TOKEN: string;
    UPLOAD_TOKEN: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'mp3'];

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        const checkAuth = (req: Request) => {
            const authHeader = req.headers.get('Authorization');
            return authHeader === `Bearer ${env.UPLOAD_TOKEN}`;
        };

        try {
            if (url.pathname === '/api/stats' && request.method === 'GET') {
                const { results } = await env.DB.prepare("SELECT count(*) as total, sum(file_size) as total_size FROM uploads").all();
                return new Response(JSON.stringify({ success: true, stats: results[0] }), {
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }

            if (url.pathname === '/api/upload' && request.method === 'POST') {
                const formData = await request.formData();
                const token = formData.get('token');
                
                const isTokenValid = token === env.UPLOAD_TOKEN;
                if (!isTokenValid && !checkAuth(request)) {
                    return new Response(JSON.stringify({ success: false, error: 'Nao autorizado' }), { status: 401, headers: corsHeaders });
                }

                const project = formData.get('project') as string;
                const file = formData.get('image') as File | null;

                if (!file || !project) return new Response(JSON.stringify({ success: false, error: 'Dados incompletos' }), { status: 400, headers: corsHeaders });
                if (file.size > MAX_FILE_SIZE) return new Response(JSON.stringify({ success: false, error: 'Excede 10MB' }), { status: 400, headers: corsHeaders });

                const originalName = file.name;
                const ext = originalName.split('.').pop()?.toLowerCase() || '';

                if (!ALLOWED_EXTENSIONS.includes(ext)) return new Response(JSON.stringify({ success: false, error: 'Extensao invalida' }), { status: 400, headers: corsHeaders });

                const safeName = originalName.replace(`.${ext}`, '').replace(/[^a-zA-Z0-9_-]/g, '-');
                const newName = `${safeName}_${Date.now()}.${ext}`;

                const date = new Date();
                const yearMonth = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
                const githubPath = `${project}/${yearMonth}/${newName}`;

                const arrayBuffer = await file.arrayBuffer();
                const base64Content = Buffer.from(arrayBuffer).toString('base64');

                const ghUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/${githubPath}`;
                const ghResponse = await fetch(ghUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                        'User-Agent': 'Cloudflare-Worker-CDN',
                        'Content-Type': 'application/json',
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    body: JSON.stringify({
                        message: `Upload via Worker: ${originalName}`,
                        content: base64Content,
                        branch: env.GITHUB_BRANCH || 'master'
                    })
                });

                if (!ghResponse.ok) {
                    const ghError = await ghResponse.text();
                    return new Response(JSON.stringify({ success: false, error: `GitHub HTTP ${ghResponse.status}`, details: ghError }), { status: 502, headers: corsHeaders });
                }

                const ghData = await ghResponse.json() as any;

                const urls = {
                    cloudflare: `https://cdn.inglescurso.com.br/${githubPath}`,
                    jsdelivr: `https://cdn.jsdelivr.net/gh/${env.GITHUB_USER}/${env.GITHUB_REPO}/${githubPath}`,
                    raw: `https://raw.githubusercontent.com/${env.GITHUB_USER}/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${githubPath}`,
                    github: ghData.content?.html_url || ''
                };

                // FIX: Salvando o SHA do Blob (content) e nao o SHA do commit
                const correctSha = ghData.content?.sha || ghData.commit?.sha || 'N/A';

                await env.DB.prepare(
                    `INSERT INTO uploads (project_key, project_name, original_name, file_name, file_path, file_size, file_extension, cdn_url, raw_url, github_url, commit_sha, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    project, project, originalName, newName, githubPath, file.size, ext, urls.jsdelivr, urls.raw, urls.github, correctSha, 'admin'
                ).run();

                return new Response(JSON.stringify({ success: true, urls }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            if (url.pathname === '/api/uploads' && request.method === 'GET') {
                if (!checkAuth(request)) return new Response(JSON.stringify({ success: false, error: 'Nao autorizado' }), { status: 401, headers: corsHeaders });
                const project = url.searchParams.get('project');
                let query = "SELECT * FROM uploads ORDER BY upload_date DESC LIMIT 100";
                let params: string[] = [];
                if (project && project !== 'all') {
                    query = "SELECT * FROM uploads WHERE project_key = ? ORDER BY upload_date DESC LIMIT 100";
                    params.push(project);
                }
                const { results } = await env.DB.prepare(query).bind(...params).all();
                return new Response(JSON.stringify({ success: true, uploads: results }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }

            if (url.pathname === '/api/uploads' && request.method === 'PUT') {
                if (!checkAuth(request)) return new Response(JSON.stringify({ success: false, error: 'Nao autorizado' }), { status: 401, headers: corsHeaders });
                const data = await request.json() as any;
                const { id, new_name } = data;
                if (!id || !new_name) return new Response(JSON.stringify({ success: false, error: 'Dados invalidos' }), { status: 400, headers: corsHeaders });

                const fileRecord = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?").bind(id).first() as any;
                if (!fileRecord) return new Response(JSON.stringify({ success: false, error: 'Arquivo nao encontrado' }), { status: 404, headers: corsHeaders });

                const safeNewName = new_name.replace(/[^a-zA-Z0-9_-]/g, '-');
                const newFileName = `${safeNewName}.${fileRecord.file_extension}`;
                const pathParts = fileRecord.file_path.split('/');
                pathParts.pop();
                const newPath = `${pathParts.join('/')}/${newFileName}`;

                // 1. Pegar meta do arquivo antigo
                const getUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/${fileRecord.file_path}`;
                const getRes = await fetch(getUrl, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-CDN' } });
                if (!getRes.ok) return new Response(JSON.stringify({ success: false, error: 'Falha GitHub GET' }), { status: 502, headers: corsHeaders });
                
                const fileData = await getRes.json() as any;

                // FIX: Bypass de 1MB. Se o GitHub omitiu o 'content', nos baixamos pela Cloudflare e convertemos.
                let fileBase64 = fileData.content;
                if (!fileBase64 || fileBase64.trim() === '') {
                    const rawFileRes = await fetch(fileRecord.raw_url);
                    if (!rawFileRes.ok) return new Response(JSON.stringify({ success: false, error: 'Falha ao baixar binario' }), { status: 502, headers: corsHeaders });
                    const arrayBuffer = await rawFileRes.arrayBuffer();
                    fileBase64 = Buffer.from(arrayBuffer).toString('base64');
                }

                // 2. Criar novo
                const putUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/${newPath}`;
                const putRes = await fetch(putUrl, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-CDN', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Rename: -> ${newFileName}`, content: fileBase64, branch: env.GITHUB_BRANCH || 'master' })
                });
                if (!putRes.ok) return new Response(JSON.stringify({ success: false, error: 'Falha GitHub PUT' }), { status: 502, headers: corsHeaders });
                const newFileData = await putRes.json() as any;

                // 3. Deletar antigo (usando Blob SHA exato)
                await fetch(getUrl, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-CDN', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Delete old: ${fileRecord.original_name}`, sha: fileData.sha, branch: env.GITHUB_BRANCH || 'master' })
                });

                // 4. DB
                const newCdnUrl = fileRecord.cdn_url.replace(fileRecord.file_name, newFileName);
                const newRawUrl = fileRecord.raw_url.replace(fileRecord.file_name, newFileName);
                await env.DB.prepare(`UPDATE uploads SET original_name = ?, file_name = ?, file_path = ?, cdn_url = ?, raw_url = ?, commit_sha = ? WHERE id = ?`)
                    .bind(newFileName, newFileName, newPath, newCdnUrl, newRawUrl, newFileData.content?.sha || 'N/A', id).run();

                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            if (url.pathname === '/api/uploads' && request.method === 'DELETE') {
                if (!checkAuth(request)) return new Response(JSON.stringify({ success: false, error: 'Nao autorizado' }), { status: 401, headers: corsHeaders });
                const data = await request.json() as any;
                if (!data.id) return new Response(JSON.stringify({ success: false, error: 'ID invalido' }), { status: 400, headers: corsHeaders });

                const fileRecord = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?").bind(data.id).first() as any;
                if (!fileRecord) return new Response(JSON.stringify({ success: false, error: 'Nao encontrado' }), { status: 404, headers: corsHeaders });

                const ghUrl = `https://api.github.com/repos/${env.GITHUB_USER}/${env.GITHUB_REPO}/contents/${fileRecord.file_path}`;
                
                // FIX: Recuperar Blob SHA em tempo real para evitar conflitos de commit_sha legado
                const getRes = await fetch(ghUrl, { headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-CDN' } });
                let blobSha = fileRecord.commit_sha;
                if (getRes.ok) {
                    const ghData = await getRes.json() as any;
                    blobSha = ghData.sha;
                }

                const delRes = await fetch(ghUrl, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Cloudflare-Worker-CDN', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Delete: ${fileRecord.original_name}`, sha: blobSha, branch: env.GITHUB_BRANCH || 'master' })
                });

                if (delRes.ok || delRes.status === 404) {
                    await env.DB.prepare("DELETE FROM uploads WHERE id = ?").bind(data.id).run();
                    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
                }
                return new Response(JSON.stringify({ success: false, error: 'Falha GitHub DELETE' }), { status: 500, headers: corsHeaders });
            }

            return new Response(JSON.stringify({ error: "Endpoint invalido" }), { status: 404, headers: corsHeaders });
        } catch (err: any) {
            return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
        }
    }
};
