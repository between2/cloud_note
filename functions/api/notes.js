
export async function onRequest(context) {
    const { request, env } = context;
    const db = env.DB; 

    // Handle CORS preflight requests
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

    if (request.method === 'GET') {
        const { results } = await db.prepare("SELECT * FROM notes ORDER BY created_at DESC").all();
        return new Response(JSON.stringify(results || []), { headers });
    }

    if (request.method === 'POST') {
        const { content } = await request.json();
        await db.prepare("INSERT INTO notes (content) VALUES (?)").bind(content).run();
        return new Response('Created', { status: 201, headers });
    }

    if (request.method === 'PUT') {
        const { id, content } = await request.json();
        await db.prepare("UPDATE notes SET content = ? WHERE id = ?").bind(content, id).run();
        return new Response('Updated', { status: 200, headers });
    }
    
    if (request.method === 'DELETE') {
        const { id } = await request.json();
        await db.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
        return new Response('Deleted', { status: 200, headers });
    }

    return new Response('Method Not Allowed', { status: 405, headers });
}
    
