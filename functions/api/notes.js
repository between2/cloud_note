export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB; 

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    };

    try {
        // 获取列表：按置顶状态优先排序，再按时间倒序
        if (request.method === 'GET') {
            const { results } = await db.prepare("SELECT * FROM notes ORDER BY is_pinned DESC, created_at DESC").all();
            return new Response(JSON.stringify(results || []), { headers });
        }

        // 新增备忘录
        if (request.method === 'POST') {
            const { title, content, is_pinned, password } = await request.json();
            await db.prepare("INSERT INTO notes (title, content, is_pinned, password) VALUES (?, ?, ?, ?)")
                .bind(title || '', content || '', is_pinned ? 1 : 0, password || '')
                .run();
            return new Response(JSON.stringify({ success: true }), { status: 201, headers });
        }

        // 修改备忘录
        if (request.method === 'PUT') {
            const { id, title, content, is_pinned, password } = await request.json();
            await db.prepare("UPDATE notes SET title = ?, content = ?, is_pinned = ?, password = ? WHERE id = ?")
                .bind(title || '', content || '', is_pinned ? 1 : 0, password || '', id)
                .run();
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }
        
        // 删除备忘录
        if (request.method === 'DELETE') {
            const { id } = await request.json();
            await db.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
            return new Response(JSON.stringify({ success: true }), { status: 200, headers });
        }
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }

    return new Response('Method Not Allowed', { status: 405, headers });
}
