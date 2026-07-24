export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB;

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    try {
        // 获取所有自定义文件夹
        if (request.method === 'GET') {
            const { results } = await db.prepare("SELECT * FROM folders ORDER BY id ASC").all();
            return new Response(JSON.stringify(results || []), { headers });
        }

        // 新建文件夹
        if (request.method === 'POST') {
            const { name } = await request.json();
            if (!name || !name.trim()) return new Response(JSON.stringify({ error: 'Folder name empty' }), { status: 400, headers });
            await db.prepare("INSERT INTO folders (name) VALUES (?)").bind(name.trim()).run();
            return new Response(JSON.stringify({ success: true }), { status: 201, headers });
        }

        // 删除文件夹
        if (request.method === 'DELETE') {
            const { id } = await request.json();
            await db.prepare("DELETE FROM folders WHERE id = ?").bind(id).run();
            // 同时把该文件夹下的笔记归类为“未分类”(0)
            await db.prepare("UPDATE notes SET folder_id = 0 WHERE folder_id = ?").bind(id).run();
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }

    return new Response('Method Not Allowed', { status: 405, headers });
}