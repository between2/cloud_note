// Base64URL 辅助工具
function base64urlEncode(source) {
    let encoded = btoa(String.fromCharCode(...new Uint8Array(source)));
    return encoded.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const decoded = atob(str);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return bytes;
}

// 1. 密码哈希 (SHA-256 + Salt)
async function hashPassword(password) {
    const salt = "CF_NOTE_SECRET_SALT_2026";
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 2. 签发 JWT
async function signJWT(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const expPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) };

    const encHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const encPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(expPayload)));
    const data = `${encHeader}.${encPayload}`;

    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    return `${data}.${base64urlEncode(signature)}`;
}

// 3. 验证 JWT
async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [encHeader, encPayload, encSig] = parts;
        const data = `${encHeader}.${encPayload}`;

        const key = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const valid = await crypto.subtle.verify('HMAC', key, base64urlDecode(encSig), new TextEncoder().encode(data));
        if (!valid) return null;

        const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(encPayload)));
        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;

        return payload;
    } catch (e) {
        return null;
    }
}

function jsonRes(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const secret = env.JWT_SECRET || "default_jwt_secret_key_123456";

    // 1. 注册接口
    if (path === '/api/register' && method === 'POST') {
        const { username, password, guestNotes = [] } = await request.json();
        if (!username || !password) return jsonRes({ error: "账号或密码不能为空" }, 400);

        const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
        if (existing) return jsonRes({ error: "用户名已存在" }, 400);

        const pwdHash = await hashPassword(password);
        const user = await env.DB.prepare("INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?) RETURNING id")
            .bind(username, pwdHash, username).first();
        const userId = user.id;

        if (guestNotes.length > 0) {
            const stmts = guestNotes.map(n => 
                env.DB.prepare("INSERT INTO notes (title, content, is_pinned, password, folder_id, user_id) VALUES (?, ?, ?, ?, ?, ?)")
                    .bind(n.title || '', n.content || '', n.is_pinned ? 1 : 0, n.password || '', n.folder_id || 0, userId)
            );
            await env.DB.batch(stmts);
        }

        const token = await signJWT({ userId, username }, secret);
        return jsonRes({ success: true, token, username, nickname: username });
    }

    // 2. 登录接口
    if (path === '/api/login' && method === 'POST') {
        const { username, password, guestNotes = [] } = await request.json();
        const pwdHash = await hashPassword(password);
        const user = await env.DB.prepare("SELECT id, username, nickname, avatar_url FROM users WHERE username = ? AND password_hash = ?").bind(username, pwdHash).first();

        if (!user) return jsonRes({ error: "账号或密码错误" }, 401);

        if (guestNotes.length > 0) {
            const stmts = guestNotes.map(n => 
                env.DB.prepare("INSERT INTO notes (title, content, is_pinned, password, folder_id, user_id) VALUES (?, ?, ?, ?, ?, ?)")
                    .bind(n.title || '', n.content || '', n.is_pinned ? 1 : 0, n.password || '', n.folder_id || 0, user.id)
            );
            await env.DB.batch(stmts);
        }

        const token = await signJWT({ userId: user.id, username: user.username }, secret);
        return jsonRes({ success: true, token, username: user.username, nickname: user.nickname || user.username, avatar_url: user.avatar_url });
    }

    // 3. 鉴权中间件
    const authHeader = request.headers.get('Authorization');
    let userId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const payload = await verifyJWT(token, secret);
        if (payload) userId = payload.userId;
    }

    if (!userId) {
        return jsonRes({ error: "未登录或凭证无效" }, 401);
    }

    // 4. 用户资料接口 (个人信息、修改头像昵称、统计数)
    if (path === '/api/user/profile') {
        if (method === 'GET') {
            const user = await env.DB.prepare("SELECT username, nickname, avatar_url FROM users WHERE id = ?").bind(userId).first();
            const noteCountRes = await env.DB.prepare("SELECT COUNT(*) as count FROM notes WHERE user_id = ?").bind(userId).first();
            return jsonRes({
                username: user?.username || '',
                nickname: user?.nickname || user?.username || '未设置昵称',
                avatar_url: user?.avatar_url || '',
                note_count: noteCountRes?.count || 0
            });
        }
        if (method === 'PUT') {
            const { nickname, avatar_url } = await request.json();
            await env.DB.prepare("UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url) WHERE id = ?")
                .bind(nickname, avatar_url, userId).run();
            return jsonRes({ success: true });
        }
    }

    // 5. 笔记 CRUD
    if (path === '/api/notes') {
        if (method === 'GET') {
            const { results } = await env.DB.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY is_pinned DESC, created_at DESC").bind(userId).all();
            return jsonRes(results || []);
        }
        if (method === 'POST') {
            const { title, content, is_pinned, password, folder_id } = await request.json();
            const res = await env.DB.prepare("INSERT INTO notes (title, content, is_pinned, password, folder_id, user_id) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
                .bind(title || '', content || '', is_pinned ? 1 : 0, password || '', folder_id || 0, userId).first();
            return jsonRes({ success: true, id: res.id });
        }
        if (method === 'PUT') {
            const { id, title, content, is_pinned, password, folder_id } = await request.json();
            await env.DB.prepare("UPDATE notes SET title = ?, content = ?, is_pinned = ?, password = ?, folder_id = ? WHERE id = ? AND user_id = ?")
                .bind(title || '', content || '', is_pinned ? 1 : 0, password || '', folder_id || 0, id, userId).run();
            return jsonRes({ success: true });
        }
        if (method === 'DELETE') {
            const { id } = await request.json();
            await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, userId).run();
            return jsonRes({ success: true });
        }
    }

    // 6. 文件夹 CRUD
    if (path === '/api/folders') {
        if (method === 'GET') {
            const { results } = await env.DB.prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY id ASC").bind(userId).all();
            return jsonRes(results || []);
        }
        if (method === 'POST') {
            const { name } = await request.json();
            const res = await env.DB.prepare("INSERT INTO folders (name, user_id) VALUES (?, ?) RETURNING id").bind(name, userId).first();
            return jsonRes({ success: true, id: res.id });
        }
        if (method === 'DELETE') {
            const { id } = await request.json();
            await env.DB.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, userId).run();
            return jsonRes({ success: true });
        }
    }

    return jsonRes({ error: "Not Found" }, 404);
}
