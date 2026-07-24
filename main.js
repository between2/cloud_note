// main.js - 备忘录核心逻辑

let notes = JSON.parse(localStorage.getItem('memo_notes')) || [
    { id: 1, title: '欢迎使用备忘录', content: '这是一个仿iOS风格的备忘录应用，支持富文本、分组、加锁、最近删除等功能。', folder: '默认文件夹', time: new Date().toLocaleString(), pinned: false, locked: false, deleted: false }
];
let trash = JSON.parse(localStorage.getItem('memo_trash')) || [];
let folders = JSON.parse(localStorage.getItem('memo_folders')) || ['默认文件夹', '工作笔记', '生活随笔'];
let currentFolder = '默认文件夹';
let currentViewTab = 'notes';
let editingNoteId = null;
let settings = JSON.parse(localStorage.getItem('memo_settings')) || {
    wordCount: true,
    fontSize: 16,
    lockDisplayMode: 'all'
};
let currentUser = JSON.parse(localStorage.getItem('memo_user')) || null;
let authMode = 'login'; // 'login' or 'register'

// 初始化
window.onload = function() {
    initSettings();
    renderSidebarFolders();
    renderNotesList();
    updateMineStats();
    updateTrashCount();
    initAuthUI();
};

// 标签页切换
function switchTab(tab) {
    currentViewTab = tab;
    document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => el.classList.remove('active'));
    
    if (tab === 'notes') {
        document.getElementById('tab-notes').classList.add('active');
        document.getElementById('nav-notes').classList.add('active');
        renderNotesList();
    } else if (tab === 'mine') {
        document.getElementById('tab-mine').classList.add('active');
        document.getElementById('nav-mine').classList.add('active');
        updateMineStats();
    }
}

// 侧边栏控制
function toggleSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (open) {
        sidebar.classList.add('open');
        overlay.classList.add('open');
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }
}

// 渲染侧边栏文件夹
function renderSidebarFolders() {
    const menuList = document.getElementById('sidebar-menu-list');
    let html = `
        <div class="sidebar-menu-item ${currentFolder === '所有笔记' ? 'active' : ''}" onclick="selectFolder('所有笔记')">所有笔记</div>
        <div class="sidebar-menu-item ${currentFolder === '已加锁' ? 'active' : ''}" onclick="selectFolder('已加锁')">🔒 已加锁</div>
    `;
    folders.forEach(f => {
        html += `<div class="sidebar-menu-item ${currentFolder === f ? 'active' : ''}" onclick="selectFolder('${f}')">📁 ${f}</div>`;
    });
    menuList.innerHTML = html;
}

function selectFolder(folderName) {
    currentFolder = folderName;
    document.getElementById('page-title').innerText = folderName;
    toggleSidebar(false);
    renderSidebarFolders();
    renderNotesList();
}

function createNewFolder() {
    let name = prompt('请输入新文件夹名称：');
    if (name && name.trim()) {
        name = name.trim();
        if (!folders.includes(name)) {
            folders.push(name);
            localStorage.setItem('memo_folders', JSON.stringify(folders));
            renderSidebarFolders();
        } else {
            alert('文件夹已存在');
        }
    }
}

// 渲染笔记列表
function renderNotesList() {
    const listEl = document.getElementById('notes-list');
    let filtered = notes.filter(n => !n.deleted);

    if (currentFolder === '所有笔记') {
        // 显示全部
    } else if (currentFolder === '已加锁') {
        filtered = filtered.filter(n => n.locked);
    } else {
        if (settings.lockDisplayMode === 'locked_only') {
            filtered = filtered.filter(n => n.folder === currentFolder && !n.locked);
        } else {
            filtered = filtered.filter(n => n.folder === currentFolder);
        }
    }

    // 排序：置顶优先，其次按时间倒序
    filtered.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned - a.pinned;
        return new Date(b.time) - new Date(a.time);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; color:var(--text-sub); margin-top:40px;">暂无笔记</div>`;
        return;
    }

    let html = '';
    filtered.forEach(n => {
        let snippet = n.content.replace(/<[^>]+>/g, '');
        html += `
            <div class="note-item" onclick="openEditor(${n.id})" oncontextmenu="showContextMenu(event, ${n.id})">
                <div class="note-item-title">${n.pinned ? '📌 ' : ''}${n.locked ? '🔒 ' : ''}${n.title || '无标题'}</div>
                <div class="note-item-snippet">${snippet || '无正文内容'}</div>
                <div class="note-item-footer">
                    <span>${n.time}</span>
                    <span>${n.folder}</span>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
}

// 编辑器相关
function openEditor(id = null) {
    editingNoteId = id;
    const titleInput = document.getElementById('note-title-input');
    const contentEditor = document.getElementById('note-content-editor');
    
    if (id) {
        const note = notes.find(n => n.id === id);
        if (note) {
            titleInput.value = note.title;
            contentEditor.innerHTML = note.content;
        }
    } else {
        titleInput.value = '';
        contentEditor.innerHTML = '';
    }
    
    onEditorInput();
    document.getElementById('editor-view').classList.add('active');
}

function saveNote() {
    const titleInput = document.getElementById('note-title-input').value.trim();
    const contentEditor = document.getElementById('note-content-editor').innerHTML.trim();
    
    if (!titleInput && !contentEditor) {
        document.getElementById('editor-view').classList.remove('active');
        return;
    }

    let targetFolder = currentFolder;
    if (targetFolder === '所有笔记' || targetFolder === '已加锁') {
        targetFolder = '默认文件夹';
    }

    if (editingNoteId) {
        const note = notes.find(n => n.id === editingNoteId);
        if (note) {
            note.title = titleInput || '无标题';
            note.content = contentEditor;
            note.time = new Date().toLocaleString();
        }
    } else {
        const newNote = {
            id: Date.now(),
            title: titleInput || '无标题',
            content: contentEditor,
            folder: targetFolder,
            time: new Date().toLocaleString(),
            pinned: false,
            locked: false,
            deleted: false
        };
        notes.unshift(newNote);
    }

    saveData();
    document.getElementById('editor-view').classList.remove('active');
    renderNotesList();
    updateMineStats();
}

function onEditorInput() {
    const content = document.getElementById('note-content-editor').innerText;
    const wordCount = content.length;
    if (settings.wordCount) {
        document.getElementById('editor-word-count-tag').innerText = `${wordCount} 字`;
    } else {
        document.getElementById('editor-word-count-tag').innerText = '';
    }
}

// 富文本排版控制
function toggleAaPanel() {
    const panel = document.getElementById('editor-aa-panel');
    const btn = document.getElementById('btn-toggle-aa');
    panel.classList.toggle('active');
    btn.classList.toggle('active');
}

function formatDoc(cmd, value = null) {
    document.execCommand(cmd, false, value);
}

function setEditorFontSize(size, el) {
    document.querySelectorAll('.size-opt').forEach(o => o.classList.remove('active'));
    el.classList.add('active');
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = size + 'px';
    span.appendChild(range.extractContents());
    range.insertNode(span);
}

function setEditorColor(color, el) {
    document.querySelectorAll('.color-block').forEach(b => {
        b.classList.remove('active');
        b.innerHTML = '';
    });
    el.classList.add('active');
    el.innerHTML = '✓';
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, color);
}

function toggleHighlight() {
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, '#ffcc00');
}

function insertChecklist() {
    const html = '<br><input type="checkbox"> 待办事项<br>';
    document.execCommand('insertHTML', false, html);
}

function triggerNoteImageSelect() {
    document.getElementById('note-image-file-input').click();
}

function uploadNoteImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgHtml = `<br><img src="${e.target.result}" style="max-width:100%; border-radius:8px; margin:8px 0;"><br>`;
            document.execCommand('insertHTML', false, imgHtml);
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function toggleFolderSelect() {
    alert('当前文件夹: ' + currentFolder);
}

// 长按菜单
let contextNoteId = null;
function showContextMenu(e, id) {
    e.preventDefault();
    contextNoteId = id;
    const menu = document.getElementById('context-menu');
    const overlay = document.getElementById('context-overlay');
    
    const note = notes.find(n => n.id === id);
    if (note) {
        document.getElementById('menu-pin-text').innerText = note.pinned ? '取消置顶' : '置顶';
        document.getElementById('menu-lock-text').innerText = note.locked ? '取消加密' : '加密';
    }

    menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
    menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
    menu.classList.add('active');
    overlay.classList.add('active');
}

function closeContextMenu() {
    document.getElementById('context-menu').classList.remove('active');
    document.getElementById('context-overlay').classList.remove('active');
}

function handleMenuAction(action) {
    const note = notes.find(n => n.id === contextNoteId);
    if (!note) return;

    if (action === 'pin') {
        note.pinned = !note.pinned;
    } else if (action === 'lock') {
        note.locked = !note.locked;
    } else if (action === 'delete') {
        note.deleted = true;
        note.deleteTime = Date.now();
        trash.push(note);
        notes = notes.filter(n => n.id !== contextNoteId);
        localStorage.setItem('memo_trash', JSON.stringify(trash));
        updateTrashCount();
    }
    saveData();
    closeContextMenu();
    renderNotesList();
    updateMineStats();
}

// 数据持久化
function saveData() {
    localStorage.setItem('memo_notes', JSON.stringify(notes));
}

// “我的” 页面与统计
function updateMineStats() {
    const activeNotes = notes.filter(n => !n.deleted);
    document.getElementById('stat-notes-count').innerText = activeNotes.length;
    
    let totalWords = 0;
    activeNotes.forEach(n => {
        totalWords += n.content.replace(/<[^>]+>/g, '').length;
    });
    document.getElementById('stat-words-count').innerText = totalWords;
}

function triggerAvatarUpload() {
    document.getElementById('avatar-file-input').click();
}

function handleAvatarSelected(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('my-avatar-img').src = e.target.result;
            if (currentUser) {
                currentUser.avatar = e.target.result;
                localStorage.setItem('memo_user', JSON.stringify(currentUser));
            }
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function editNickname() {
    let name = prompt('修改昵称：', document.getElementById('my-nickname').innerText);
    if (name && name.trim()) {
        document.getElementById('my-nickname').innerText = name.trim();
        if (currentUser) {
            currentUser.nickname = name.trim();
            localStorage.setItem('memo_user', JSON.stringify(currentUser));
        }
    }
}

// 最近删除
function updateTrashCount() {
    const trashEl = document.getElementById('trash-count-display');
    trashEl.innerText = trash.length;
    
    const trashListEl = document.getElementById('trash-list');
    if (trash.length === 0) {
        trashListEl.innerHTML = `<div style="text-align:center; color:var(--text-sub); margin-top:40px;">回收站为空</div>`;
        return;
    }

    let html = '';
    trash.forEach(n => {
        html += `
            <div class="note-item">
                <div class="note-item-title">${n.title || '无标题'}</div>
                <div class="note-item-footer">
                    <span>删除于: ${new Date(n.deleteTime).toLocaleDateString()}</span>
                    <span style="color:var(--ios-blue); cursor:pointer;" onclick="restoreTrash(${n.id})">还原</span>
                </div>
            </div>
        `;
    });
    trashListEl.innerHTML = html;
}

function restoreTrash(id) {
    const item = trash.find(n => n.id === id);
    if (item) {
        item.deleted = false;
        delete item.deleteTime;
        notes.push(item);
        trash = trash.filter(n => n.id !== id);
        localStorage.setItem('memo_trash', JSON.stringify(trash));
        saveData();
        updateTrashCount();
        renderNotesList();
        updateMineStats();
    }
}

function clearAllTrash() {
    if (confirm('确定清空所有最近删除的笔记吗？')) {
        trash = [];
        localStorage.setItem('memo_trash', JSON.stringify(trash));
        updateTrashCount();
    }
}

// 设置相关
function initSettings() {
    document.getElementById('setting-word-count').checked = settings.wordCount;
    document.getElementById('setting-font-size-text').innerText = settings.fontSize;
}

function saveSettings() {
    settings.wordCount = document.getElementById('setting-word-count').checked;
    localStorage.setItem('memo_settings', JSON.stringify(settings));
    onEditorInput();
}

function changeDefaultFontSize() {
    let size = prompt('请输入默认字体大小 (px)：', settings.fontSize);
    if (size && !isNaN(size)) {
        settings.fontSize = parseInt(size);
        document.getElementById('setting-font-size-text').innerText = settings.fontSize;
        localStorage.setItem('memo_settings', JSON.stringify(settings));
    }
}

function openLockModal() {
    document.getElementById('lock-modal-overlay').classList.add('active');
    document.getElementById('lock-modal-card').classList.add('active');
    updateLockRadioUI();
}

function closeLockModal() {
    document.getElementById('lock-modal-overlay').classList.remove('active');
    document.getElementById('lock-modal-card').classList.remove('active');
}

function setLockDisplayMode(mode) {
    settings.lockDisplayMode = mode;
    localStorage.setItem('memo_settings', JSON.stringify(settings));
    updateLockRadioUI();
    closeLockModal();
    renderNotesList();
}

function updateLockRadioUI() {
    const allDot = document.getElementById('radio-lock-all');
    const onlyDot = document.getElementById('radio-lock-only');
    if (settings.lockDisplayMode === 'all') {
        allDot.classList.add('selected');
        onlyDot.classList.remove('selected');
    } else {
        allDot.classList.remove('selected');
        onlyDot.classList.add('selected');
    }
}

function openSubView(viewId) {
    document.getElementById(viewId).classList.add('active');
}

function closeSubView(viewId) {
    document.getElementById(viewId).classList.remove('active');
}

// 账号登录/注册
function initAuthUI() {
    const btnText = document.getElementById('auth-btn-text');
    const usernameDisplay = document.getElementById('my-username-display');
    const nicknameEl = document.getElementById('my-nickname');
    const avatarImg = document.getElementById('my-avatar-img');

    if (currentUser) {
        btnText.innerText = '退出登录';
        btnText.style.color = 'var(--delete-red)';
        usernameDisplay.innerText = `账号: ${currentUser.username}`;
        nicknameEl.innerText = currentUser.nickname || currentUser.username;
        if (currentUser.avatar) avatarImg.src = currentUser.avatar;
    } else {
        btnText.innerText = '登录账号开启同步';
        btnText.style.color = 'var(--ios-yellow)';
        usernameDisplay.innerText = '账号: 游客模式';
        nicknameEl.innerText = '点击设置昵称';
    }
}

function handleAuthButtonClick() {
    if (currentUser) {
        if (confirm('确定要退出登录吗？')) {
            currentUser = null;
            localStorage.removeItem('memo_user');
            initAuthUI();
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

function toggleAuthMode() {
    const title = document.getElementById('auth-title');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchBtn = document.getElementById('auth-switch-btn');

    if (authMode === 'login') {
        authMode = 'register';
        title.innerText = '账号注册';
        submitBtn.innerText = '注册并登录';
        switchBtn.innerText = '已有账号？立即登录';
    } else {
        authMode = 'login';
        title.innerText = '账号登录';
        submitBtn.innerText = '登录';
        switchBtn.innerText = '没有账号？立即注册';
    }
}

function submitAuth() {
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value.trim();
    if (!u || !p) {
        alert('请输入用户名和密码');
        return;
    }

    if (authMode === 'register') {
        currentUser = { username: u, password: p, nickname: u, avatar: '' };
        localStorage.setItem('memo_user', JSON.stringify(currentUser));
        alert('注册成功并已登录');
    } else {
        currentUser = { username: u, password: p, nickname: u, avatar: '' };
        localStorage.setItem('memo_user', JSON.stringify(currentUser));
        alert('登录成功');
    }
    closeAuthModal();
    initAuthUI();
}
