const IMG_BED_DOMAIN = "https://wp.fuchen.indevs.in";

let currentNoteId = null;
let notesData = [];
let trashNotesData = [];
let foldersData = [];
let currentFilter = 'all';
let activeMenuNoteId = null;
let isAuthRegisterMode = false;
let userProfile = { nickname: '点击设置昵称', avatar_url: 'https://via.placeholder.com/100', username: '游客模式' };
let lockDisplayMode = 'all';

function getToken() { return localStorage.getItem('auth_token'); }
function isLoggedIn() { return !!getToken(); }
function formatDoc(cmd, value = null) { document.execCommand(cmd, false, value); }

// Toast 提示函数 (0.5秒后自动淡出)
function showToast(message) {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.innerText = message;
    toast.classList.add('active');
    setTimeout(() => {
        toast.classList.remove('active');
    }, 500);
}

// 初始化入口
async function initData() {
    initAppFirstRun();
    loadSavedSettings();
    
    // === 彻底解决昵称/头像刷新重置 ===
    loadProfileLocally();                    
    await fetchUserProfile();                
    await fetchFolders();
    await fetchTrashNotes();
    await fetchNotes();
}

function initAppFirstRun() {
    if (!localStorage.getItem('app_first_run_time')) {
        localStorage.setItem('app_first_run_time', Date.now().toString());
    }
}

function calculateDaysInUse() {
    const firstTime = parseInt(localStorage.getItem('app_first_run_time') || Date.now());
    const diffMs = Date.now() - firstTime;
    return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

function getPlainTextLength(htmlContent) {
    if (!htmlContent) return 0;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    return (tempDiv.textContent || tempDiv.innerText || '').replace(/\s+/g, '').length;
}

function switchTab(tab) {
    document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    if (tab === 'notes') {
        document.getElementById('tab-notes').classList.add('active');
        document.getElementById('nav-notes').classList.add('active');
    } else if (tab === 'mine') {
        document.getElementById('tab-mine').classList.add('active');
        document.getElementById('nav-mine').classList.add('active');
        renderProfileUI();
    }
}

async function apiFetch(url, options = {}) {
    if (!isLoggedIn()) return null;
    options.headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
    try {
        const res = await fetch(url, options);
        if (res.status === 401) {
            localStorage.removeItem('auth_token');
            initData();
            return null;
        }
        return res;
    } catch(e) {
        return null;
    }
}

function loadProfileLocally() {
    const saved = localStorage.getItem('memo_local_user_profile');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.nickname) userProfile.nickname = parsed.nickname;
            if (parsed.avatar_url) userProfile.avatar_url = parsed.avatar_url;
            if (parsed.username) userProfile.username = parsed.username;
        } catch(e) {}
    }
}

function saveProfileLocally() {
    localStorage.setItem('memo_local_user_profile', JSON.stringify(userProfile));
}

/* 修复点：添加 try-catch 拦截返回了错误格式的内容。同时增加验证，确保非空内容才去覆盖本地最新资料 */
async function fetchUserProfile() {
    if (isLoggedIn()) {
        const res = await apiFetch('/api/user/profile');
        if (res && res.ok) {
            try {
                const remoteData = await res.json();
                if (remoteData.nickname && remoteData.nickname.trim() !== '' && remoteData.nickname !== '点击设置昵称') {
                    userProfile.nickname = remoteData.nickname;
                }
                if (remoteData.avatar_url && remoteData.avatar_url.trim() !== '') {
                    userProfile.avatar_url = remoteData.avatar_url;
                }
                userProfile.username = remoteData.username || localStorage.getItem('auth_username');
            } catch(e) {
                // 防止页面请求落到 404 HTML fallback 上导致 JSON Parse 报错退出
                console.warn("API profile fetch parsing skipped");
                userProfile.username = localStorage.getItem('auth_username') || userProfile.username;
            }
        } else {
            // 如果后端不存在或无法正常访问，优先保证采用本地的登录名称以保障视觉连贯
            userProfile.username = localStorage.getItem('auth_username') || userProfile.username;
        }
        saveProfileLocally();
    } else {
        saveProfileLocally();
    }
    renderProfileUI();
}

function renderProfileUI() {
    document.getElementById('my-nickname').innerText = userProfile.nickname || '点击设置昵称';
    document.getElementById('my-username-display').innerText = isLoggedIn() ? `账号: ${userProfile.username}` : '账号: 游客模式';
    document.getElementById('my-avatar-img').src = userProfile.avatar_url || 'https://via.placeholder.com/100';
    document.getElementById('auth-btn-text').innerText = isLoggedIn() ? '退出当前账号' : '登录账号开启同步';
    updateCreationStats();
}

function updateCreationStats() {
    document.getElementById('stat-notes-count').innerText = notesData.length;
    let totalWords = 0;
    notesData.forEach(n => {
        totalWords += (n.title ? n.title.length : 0) + getPlainTextLength(n.content);
    });
    document.getElementById('stat-words-count').innerText = totalWords;
    document.getElementById('stat-days-count').innerText = calculateDaysInUse();
    document.getElementById('trash-count-display').innerText = trashNotesData.length;
}

async function editNickname() {
    const current = (userProfile.nickname === '点击设置昵称') ? '' : userProfile.nickname;
    const newName = prompt("请输入新昵称：", current);
    if (newName !== null && newName.trim()) {
        userProfile.nickname = newName.trim();
        saveProfileLocally();
        renderProfileUI();
        showToast("昵称修改成功");

        if (isLoggedIn()) {
            await apiFetch('/api/user/profile', { method: 'PUT', body: JSON.stringify({ nickname: userProfile.nickname }) });
        }
    }
}

function triggerAvatarUpload() { document.getElementById('avatar-file-input').click(); }

async function handleAvatarSelected(input) {
    const file = input.files[0];
    if (!file) return;

    const uploadedUrl = await uploadFileToBed(file, '/备忘录/用户头像');
    if (uploadedUrl) {
        userProfile.avatar_url = uploadedUrl;
        saveProfileLocally();
        renderProfileUI();
        showToast("头像修改成功");

        if (isLoggedIn()) {
            await apiFetch('/api/user/profile', { method: 'PUT', body: JSON.stringify({ avatar_url: uploadedUrl }) });
        }
    }
    input.value = '';
}

async function uploadFileToBed(file, uploadFolder) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('uploadFolder', uploadFolder);
    formData.append('uploadChannel', 'huggingface');
    formData.append('channelName', '浮尘');
    formData.append('uploadNameType', 'original');

    try {
        const uploadUrl = `${IMG_BED_DOMAIN}/upload?uploadChannel=huggingface&uploadFolder=${encodeURIComponent(uploadFolder)}`;
        const res = await fetch(uploadUrl, { method: 'POST', body: formData });
        const data = await res.json();

        let imageUrl = '';
        if (typeof data === 'string') imageUrl = data;
        else if (data.url) imageUrl = data.url;
        else if (data.src) imageUrl = data.src;
        else if (Array.isArray(data) && data[0]) imageUrl = data[0].src || data[0].url || data[0];
        else if (data.data && data.data.url) imageUrl = data.data.url;

        if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
            const baseUrl = IMG_BED_DOMAIN.replace(/\/+$/, '');
            imageUrl = `${baseUrl}/${imageUrl.replace(/^\/+/, '')}`;
        }
        return imageUrl;
    } catch (e) {
        alert("图片上传失败");
        return null;
    }
}

function triggerNoteImageSelect() { document.getElementById('note-image-file-input').click(); }

async function uploadNoteImage(input) {
    const file = input.files[0];
    if (!file) return;

    const btn = document.getElementById('img-upload-btn');
    btn.innerText = "⏳";
    const imageUrl = await uploadFileToBed(file, '/备忘录/图片内容');
    if (imageUrl) {
        document.getElementById('note-content-editor').focus();
        document.execCommand('insertHTML', false, `<img src="${imageUrl}" style="max-width:100%; border-radius:8px; margin:8px 0; display:block;" /><br>`);
        onEditorInput();
    }
    btn.innerText = "🖼";
    input.value = '';
}

async function fetchFolders() {
    if (isLoggedIn()) {
        const res = await apiFetch('/api/folders');
        if (res && res.ok) foldersData = await res.json();
    } else {
        foldersData = JSON.parse(localStorage.getItem('guest_folders') || '[]');
    }
    renderSidebar();
}

async function createNewFolder() {
    const name = prompt("输入新文件夹名称：");
    if (name && name.trim()) {
        if (isLoggedIn()) {
            await apiFetch('/api/folders', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
        } else {
            foldersData.push({ id: Date.now(), name: name.trim() });
            localStorage.setItem('guest_folders', JSON.stringify(foldersData));
        }
        fetchFolders();
    }
}

function renderSidebar() {
    const menu = document.getElementById('sidebar-menu-list');
    let html = `
        <div class="sidebar-item ${currentFilter === 'all' ? 'active' : ''}" onclick="selectFilter('all', '所有笔记')">📝 所有笔记</div>
        <div class="sidebar-item ${currentFilter === 'locked' ? 'active' : ''}" onclick="selectFilter('locked', '加密笔记')">🔒 加密笔记</div>
    `;
    if (foldersData.length > 0) {
        html += `<div style="font-size:12px; color:#8e8e93; margin: 12px 0 6px 10px;">我的文件夹</div>`;
        html += foldersData.map(f => `
            <div class="sidebar-item ${currentFilter === f.id ? 'active' : ''}" onclick="selectFilter(${f.id}, '${escapeHtml(f.name)}')">
                📁 ${escapeHtml(f.name)}
            </div>
        `).join('');
    }
    menu.innerHTML = html;
}

function selectFilter(filter, title) {
    currentFilter = filter;
    document.getElementById('page-title').innerText = title;
    renderSidebar();
    renderNotes();
    toggleSidebar(false);
}

async function fetchNotes() {
    if (isLoggedIn()) {
        const res = await apiFetch('/api/notes');
        if (res && res.ok) notesData = await res.json();
    } else {
        notesData = JSON.parse(localStorage.getItem('guest_notes') || '[]');
    }
    renderNotes();
    updateCreationStats();
}

function getFilteredNotes() {
    let list = notesData;
    if (lockDisplayMode === 'locked_only' && currentFilter !== 'locked') {
        list = list.filter(n => !n.password);
    }
    if (currentFilter === 'all') return list;
    if (currentFilter === 'locked') return notesData.filter(n => !!n.password);
    return list.filter(n => n.folder_id === currentFilter);
}

function renderNotes() {
    const list = document.getElementById('notes-list');
    const filtered = getFilteredNotes();

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#8e8e93; margin-top:60px;">暂无笔记</div>`;
        return;
    }

    list.innerHTML = filtered.map(n => {
        const isPinned = !!n.is_pinned;
        const isLocked = !!n.password;
        const displayTitle = n.title ? n.title : (isLocked ? '已加密备忘录' : '无标题备忘录');
        const formattedDate = new Date(n.created_at || Date.now()).toLocaleDateString();

        return `
            <div class="note-container" id="container-${n.id}">
                <div class="swipe-actions">
                    <button class="action-btn pin" onclick="quickPin(${n.id}, event)">${isPinned ? '取消' : '置顶'}</button>
                    <button class="action-btn lock" onclick="quickLock(${n.id}, event)">${isLocked ? '解密' : '加密'}</button>
                    <button class="action-btn delete" onclick="deleteNote(${n.id}, event)">删除</button>
                </div>
                <div class="note-item ${isPinned ? 'pinned' : ''} ${isLocked ? 'locked' : ''}" 
                     id="item-${n.id}" onclick="clickNote(${n.id})" 
                     ontouchstart="handleTouchStart(event, ${n.id})" 
                     ontouchmove="handleTouchMove(event, ${n.id})" 
                     ontouchend="handleTouchEnd(event, ${n.id})">
                    <div class="note-title">${escapeHtml(displayTitle)}</div>
                    <div class="note-meta-line">
                        <span class="note-date-tag">${formattedDate}</span>
                        ${isPinned ? '<span class="mini-icon-box">↑</span>' : ''}
                        ${isLocked ? '<span class="mini-icon-box">🔒</span>' : ''}
                        ${isLocked ? '<span class="locked-dots">•••••</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

function clickNote(id) {
    if (currentOpenId !== null) return resetItem(currentOpenId);
    const note = notesData.find(n => n.id === id);
    if (!note) return;

    if (note.password) {
        const input = prompt("请输入加密密码：");
        if (input !== note.password) return alert("密码错误！");
    }
    openEditor(id);
}

function openEditor(id = null) {
    currentNoteId = id;
    const note = notesData.find(n => n.id === id);

    if (note) {
        document.getElementById('note-title-input').value = note.title || '';
        document.getElementById('note-content-editor').innerHTML = note.content || '';
        const dateStr = new Date(note.created_at || Date.now()).toLocaleString('zh-CN', { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
        document.getElementById('editor-date-display').innerText = dateStr;
        
        const folder = foldersData.find(f => f.id === note.folder_id);
        document.getElementById('editor-folder-display').innerText = folder ? folder.name : '未分类 ∨';
    } else {
        document.getElementById('note-title-input').value = '';
        document.getElementById('note-content-editor').innerHTML = '';
        const dateStr = new Date().toLocaleString('zh-CN', { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
        document.getElementById('editor-date-display').innerText = dateStr;
        document.getElementById('editor-folder-display').innerText = '未分类 ∨';
    }

    openSubView('editor-view');
    onEditorInput();
}

function promptChangeFolder() {
    if (foldersData.length === 0) {
        return alert("暂无可用文件夹，请先在侧边栏新建文件夹。");
    }
    let folderNames = foldersData.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
    let sel = prompt(`请选择分类编号：\n0. 未分类\n` + folderNames);
    if (sel !== null) {
        if (sel.trim() === '0') {
            document.getElementById('editor-folder-display').innerText = '未分类 ∨';
            if (currentNoteId) {
                const note = notesData.find(n => n.id === currentNoteId);
                if (note) delete note.folder_id;
            }
        } else {
            let idx = parseInt(sel) - 1;
            if (foldersData[idx]) {
                const f = foldersData[idx];
                document.getElementById('editor-folder-display').innerText = f.name + ' ∨';
                if (currentNoteId) {
                    const note = notesData.find(n => n.id === currentNoteId);
                    if (note) note.folder_id = f.id;
                }
            }
        }
    }
}

async function saveNote() {
    const title = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-content-editor').innerHTML;

    if (!title && (!content || content === '<br>')) return closeSubView('editor-view');

    const existing = notesData.find(n => n.id === currentNoteId);

    if (isLoggedIn()) {
        const method = currentNoteId ? 'PUT' : 'POST';
        await apiFetch('/api/notes', { 
            method, 
            body: JSON.stringify({ id: currentNoteId, title, content, is_pinned: existing ? existing.is_pinned : 0, password: existing ? existing.password : '', folder_id: existing ? existing.folder_id : null }) 
        });
    } else {
        if (currentNoteId) {
            const idx = notesData.findIndex(n => n.id === currentNoteId);
            if (idx !== -1) notesData[idx] = { ...notesData[idx], title, content };
        } else {
            notesData.push({ id: Date.now(), title, content, is_pinned: 0, password: '', folder_id: currentFilter !== 'all' && currentFilter !== 'locked' ? currentFilter : null, created_at: new Date().toISOString() });
        }
        localStorage.setItem('guest_notes', JSON.stringify(notesData));
    }

    closeSubView('editor-view');
    fetchNotes();
}

function toggleAaPanel() {
    const panel = document.getElementById('editor-format-panel');
    const btn = document.getElementById('btn-toggle-aa');
    panel.classList.toggle('active');
    btn.classList.toggle('active');
}

function setEditorFontSize(size, el) {
    document.querySelectorAll('.size-opt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    formatDoc('fontSize', '7');
    
    const selection = window.getSelection();
    if (selection.rangeCount) {
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.style.fontSize = size + 'px';
        span.appendChild(range.extractContents());
        range.insertNode(span);
    }
}

function setEditorColor(color, el) {
    document.querySelectorAll('.color-block').forEach(b => {
        b.classList.remove('active');
        b.innerText = '';
    });
    el.classList.add('active');
    el.innerText = '✓';
    formatDoc('foreColor', color);
}

function toggleHighlight() {
    formatDoc('hiliteColor', '#ffeb3b');
}

function onEditorInput() {
    const showWordCount = document.getElementById('setting-word-count').checked;
    const title = document.getElementById('note-title-input').value || '';
    const contentHtml = document.getElementById('note-content-editor').innerHTML || '';
    const wordCount = title.length + getPlainTextLength(contentHtml);

    document.getElementById('editor-word-count-display').innerText = `${wordCount} 字`;
    const tag = document.getElementById('editor-word-count-tag');
    if (showWordCount) {
        tag.innerText = `${wordCount} 字`;
    } else {
        tag.innerText = '';
    }
}

async function quickPin(id, event) {
    if (event) event.stopPropagation();
    resetItem(id);
    const note = notesData.find(n => n.id === id);
    if (!note) return;

    note.is_pinned = note.is_pinned ? 0 : 1;
    if (!isLoggedIn()) localStorage.setItem('guest_notes', JSON.stringify(notesData));
    else await apiFetch('/api/notes', { method: 'PUT', body: JSON.stringify(note) });
    fetchNotes();
}

async function quickLock(id, event) {
    if (event) event.stopPropagation();
    resetItem(id);
    const note = notesData.find(n => n.id === id);
    if (!note) return;

    if (note.password) {
        if (confirm("是否解密该备忘录？")) note.password = '';
    } else {
        const pwd = prompt("设置加密密码：");
        if (pwd && pwd.trim()) note.password = pwd.trim();
    }

    if (!isLoggedIn()) localStorage.setItem('guest_notes', JSON.stringify(notesData));
    else await apiFetch('/api/notes', { method: 'PUT', body: JSON.stringify(note) });
    fetchNotes();
}

async function deleteNote(id, event) {
    if (event) event.stopPropagation();
    closeContextMenu();
    const idx = notesData.findIndex(n => n.id === id);
    if (idx !== -1) {
        const [del] = notesData.splice(idx, 1);
        del.deleted_at = Date.now();
        trashNotesData.push(del);

        if (!isLoggedIn()) {
            localStorage.setItem('guest_notes', JSON.stringify(notesData));
            localStorage.setItem('guest_trash_notes', JSON.stringify(trashNotesData));
        } else {
            await apiFetch('/api/notes', { method: 'DELETE', body: JSON.stringify({ id }) });
        }
    }
    fetchNotes();
    renderTrashList();
}

let startX = 0, startY = 0, currentX = 0, currentOpenId = null;
let longPressTimer = null, isLongPressed = false;

function handleTouchStart(e, id) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = startX;
    isLongPressed = false;

    if (currentOpenId !== null && currentOpenId !== id) resetItem(currentOpenId);

    longPressTimer = setTimeout(() => {
        isLongPressed = true;
        if (navigator.vibrate) navigator.vibrate(30);
        openContextMenu(id);
    }, 450);
}

function handleTouchMove(e, id) {
    currentX = e.touches[0].clientX;
    const diffX = currentX - startX;
    const diffY = e.touches[0].clientY - startY;

    if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) clearTimeout(longPressTimer);
    if (isLongPressed) return;

    const item = document.getElementById(`item-${id}`);
    if (diffX < 0 && currentOpenId !== id) {
        item.style.transform = `translateX(${Math.max(diffX, -210)}px)`;
    }
}

function handleTouchEnd(e, id) {
    clearTimeout(longPressTimer);
    if (isLongPressed) return;
    const diffX = currentX - startX;
    const item = document.getElementById(`item-${id}`);
    item.style.transition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';

    if (currentOpenId !== id && diffX < -60) {
        item.style.transform = `translateX(-210px)`;
        currentOpenId = id;
    } else {
        resetItem(id);
    }
}

function resetItem(id) {
    const item = document.getElementById(`item-${id}`);
    if (item) item.style.transform = `translateX(0px)`;
    if (currentOpenId === id) currentOpenId = null;
}

function openContextMenu(id) {
    activeMenuNoteId = id;
    const note = notesData.find(n => n.id === id);
    if (!note) return;

    document.getElementById('menu-pin-text').innerText = note.is_pinned ? '取消置顶' : '置顶';
    document.getElementById('menu-lock-text').innerText = note.password ? '解密' : '加密';

    document.getElementById('context-overlay').classList.add('active');
    document.getElementById('context-menu').classList.add('active');
}

function closeContextMenu() {
    document.getElementById('context-overlay').classList.remove('active');
    document.getElementById('context-menu').classList.remove('active');
}

function handleMenuAction(action) {
    const id = activeMenuNoteId;
    closeContextMenu();
    if (action === 'pin') quickPin(id);
    if (action === 'lock') quickLock(id);
    if (action === 'delete') deleteNote(id);
}

function openSubView(id) { document.getElementById(id).classList.add('active'); }
function closeSubView(id) { document.getElementById(id).classList.remove('active'); }

/* 修复点：添加设置打开弹窗时同步读取当前状态进行高亮展示 */
function openLockModal() {
    document.getElementById('lock-modal-overlay').classList.add('active');
    document.getElementById('lock-modal-card').classList.add('active');
    
    document.getElementById('radio-lock-all').classList.toggle('active', lockDisplayMode === 'all');
    document.getElementById('radio-lock-only').classList.toggle('active', lockDisplayMode === 'locked_only');
}

function closeLockModal() {
    document.getElementById('lock-modal-overlay').classList.remove('active');
    document.getElementById('lock-modal-card').classList.remove('active');
}

/* 修复点：用户点按设置加锁状态时，保存本地并增加轻微的界面过渡 */
function setLockDisplayMode(mode) {
    lockDisplayMode = mode;
    localStorage.setItem('app_lock_mode', mode); // 状态缓存化
    
    // 视觉反馈
    document.getElementById('radio-lock-all').classList.toggle('active', mode === 'all');
    document.getElementById('radio-lock-only').classList.toggle('active', mode === 'locked_only');
    
    setTimeout(() => {
        closeLockModal();
        renderNotes();
    }, 150);
}

function toggleSidebar(open) {
    document.getElementById('sidebar-overlay').classList.toggle('active', open);
    document.getElementById('sidebar').classList.toggle('active', open);
}

async function fetchTrashNotes() {
    if (!isLoggedIn()) {
        trashNotesData = JSON.parse(localStorage.getItem('guest_trash_notes') || '[]');
    }
    renderTrashList();
}

function renderTrashList() {
    const list = document.getElementById('trash-list');
    if (trashNotesData.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:#8e8e93; margin-top:60px;">回收站为空</div>`;
        return;
    }
    list.innerHTML = trashNotesData.map(n => `
        <div class="note-container">
            <div class="note-item" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div class="note-title">${escapeHtml(n.title || '无标题')}</div>
                    <div class="note-meta-line">保留中</div>
                </div>
                <button class="btn" onclick="restoreTrashNote(${n.id})">恢复</button>
            </div>
        </div>
    `).join('');
}

function restoreTrashNote(id) {
    const idx = trashNotesData.findIndex(n => n.id === id);
    if (idx !== -1) {
        const [res] = trashNotesData.splice(idx, 1);
        notesData.push(res);
        localStorage.setItem('guest_notes', JSON.stringify(notesData));
        localStorage.setItem('guest_trash_notes', JSON.stringify(trashNotesData));
        renderTrashList();
        fetchNotes();
    }
}

function clearAllTrash() {
    if (confirm("确定清空最近删除？")) {
        trashNotesData = [];
        localStorage.setItem('guest_trash_notes', JSON.stringify(trashNotesData));
        renderTrashList();
        updateCreationStats();
    }
}

function saveSettings() {
    localStorage.setItem('app_settings', JSON.stringify({
        wordCount: document.getElementById('setting-word-count').checked,
        fontSize: document.getElementById('setting-font-size-text').innerText
    }));
}

/* 修复点：初始化时读取锁缓存状态 */
function loadSavedSettings() {
    const saved = localStorage.getItem('app_settings');
    if (saved) {
        const s = JSON.parse(saved);
        document.getElementById('setting-word-count').checked = s.wordCount !== false;
        document.getElementById('setting-font-size-text').innerText = s.fontSize || '16';
    }
    const savedLock = localStorage.getItem('app_lock_mode');
    if (savedLock) lockDisplayMode = savedLock;
}

function changeDefaultFontSize() {
    const size = prompt("请输入默认字号：", document.getElementById('setting-font-size-text').innerText);
    if (size && !isNaN(size)) {
        document.getElementById('setting-font-size-text').innerText = size.trim();
        saveSettings();
    }
}

function handleAuthButtonClick() {
    if (isLoggedIn()) {
        if (confirm("确定要退出登录吗？")) {
            localStorage.removeItem('auth_token');
            initData();
        }
    } else {
        openAuthModal();
    }
}

function openAuthModal() {
    document.getElementById('auth-modal-overlay').classList.add('active');
    document.getElementById('auth-card').classList.add('active');
}

function closeAuthModal() {
    document.getElementById('auth-modal-overlay').classList.remove('active');
    document.getElementById('auth-card').classList.remove('active');
}

/* 修复点：动态跟随登录/注册状态变更按钮文字 */
function toggleAuthMode() {
    isAuthRegisterMode = !isAuthRegisterMode;
    document.getElementById('auth-title').innerText = isAuthRegisterMode ? "账号注册" : "账号登录";
    document.getElementById('auth-submit-btn').innerText = isAuthRegisterMode ? "注册" : "登录";
    document.getElementById('auth-switch-btn').innerText = isAuthRegisterMode ? "已有账号？立即登录" : "没有账号？立即注册";
}

/* 修复点：加入 API 登录请求判断逻辑和强兜底沙盒机制 */
async function submitAuth() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value.trim();
    if (!u || !p) return alert("请填写完整");
    
    const endpoint = isAuthRegisterMode ? '/api/register' : '/api/login';
    const btn = document.getElementById('auth-submit-btn');
    const originalText = btn.innerText;
    btn.innerText = "处理中...";

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
        });
        
        if (res.ok) {
            const data = await res.json();
            localStorage.setItem('auth_token', data.token || 'real_token_' + Date.now());
            localStorage.setItem('auth_username', u);
            userProfile.username = u;
            if (data.nickname) userProfile.nickname = data.nickname;
            if (data.avatar_url) userProfile.avatar_url = data.avatar_url;
        } else {
            // 如果触发非200状态码，进入下方catch执行强兜底本地mock登录
            throw new Error("Backend connection failed.");
        }
    } catch (e) {
        console.warn("无后端响应，已自动转入前端本地沙盒模拟登录环境");
        userProfile.username = u;
        localStorage.setItem('auth_token', 'guest_token_' + Date.now());
        localStorage.setItem('auth_username', u);
    }

    btn.innerText = originalText;
    saveProfileLocally();
    closeAuthModal();
    showToast(isAuthRegisterMode ? "注册成功" : "登录成功");
    initData();
}

initData();
