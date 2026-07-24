
// 全局状态管理
let notes = JSON.parse(localStorage.getItem('cloud_notes_data') || '[]');
let trashNotes = JSON.parse(localStorage.getItem('cloud_trash_data') || '[]');
let folders = JSON.parse(localStorage.getItem('cloud_folders_data') || '["全部分类"]');
let currentFolder = "全部分类";
let currentNoteId = null;

// 用户账号与 Profile 状态 (持久化，不会因为刷新而重置)
let currentUser = JSON.parse(localStorage.getItem('cloud_user_profile') || 'null');
let userSettings = JSON.parse(localStorage.getItem('cloud_user_settings') || '{"lockDisplayMode":"all","showWordCount":true,"defaultFontSize":"16"}');

// 初始化执行
document.addEventListener("DOMContentLoaded", () => {
    initUserProfile();
    renderSidebarFolders();
    renderNotesList();
    updateCreationStats();
    updateLockModalUI();
});

// Toast 弱提示 (显示0.5秒后自动消失，UI精美)
function showToast(message) {
    const toast = document.getElementById('toast-message');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 500); // 0.5秒精准自动消失
}

/* ================= 1. 用户 Profile (头像与昵称) 管理 ================= */
function initUserProfile() {
    if (!currentUser) {
        currentUser = {
            username: '游客模式',
            nickname: '写笔记的小卡拉米',
            avatar: 'https://via.placeholder.com/100/e5a000/ffffff?text=User',
            isLoggedIn: false
        };
        saveUserProfile();
    }
    updateUserProfileUI();
}

function saveUserProfile() {
    localStorage.setItem('cloud_user_profile', JSON.stringify(currentUser));
}

function updateUserProfileUI() {
    document.getElementById('my-avatar-img').src = currentUser.avatar;
    document.getElementById('my-nickname').textContent = currentUser.nickname;
    document.getElementById('my-username-display').textContent = `账号: ${currentUser.username}`;
    document.getElementById('auth-btn-text').textContent = currentUser.isLoggedIn ? "退出当前账号" : "登录账号开启同步";
}

// 触发更换头像
function triggerAvatarUpload() {
    document.getElementById('avatar-file-input').click();
}

function handleAvatarSelected(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            currentUser.avatar = e.target.result;
            saveUserProfile();
            updateUserProfileUI();
            showToast("修改成功"); // 漂亮 UI，0.5s 消失
        };
        reader.readAsDataURL(file);
    }
}

// 修改昵称 (防止自动重置)
function editNickname() {
    const newName = prompt("请输入新昵称：", currentUser.nickname);
    if (newName && newName.trim() !== "") {
        currentUser.nickname = newName.trim();
        saveUserProfile();
        updateUserProfileUI();
        showToast("修改成功"); // 漂亮 UI，0.5s 消失
    }
}

/* ================= 2. 底部栏 Tab 切换 ================= */
function switchTab(tabName) {
    document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    if (tabName === 'notes') {
        document.getElementById('tab-notes').classList.add('active');
        document.getElementById('nav-notes').classList.add('active');
        renderNotesList();
    } else if (tabName === 'mine') {
        document.getElementById('tab-mine').classList.add('active');
        document.getElementById('nav-mine').classList.add('active');
        updateCreationStats();
    }
}

/* ================= 3. 图3功能修复: 加锁笔记显示设置 ================= */
function openLockModal() {
    updateLockModalUI();
    document.getElementById('lock-modal-overlay').style.display = 'block';
    document.getElementById('lock-modal-card').style.display = 'block';
}

function closeLockModal() {
    document.getElementById('lock-modal-overlay').style.display = 'none';
    document.getElementById('lock-modal-card').style.display = 'none';
}

function setLockDisplayMode(mode) {
    userSettings.lockDisplayMode = mode;
    localStorage.setItem('cloud_user_settings', JSON.stringify(userSettings));
    updateLockModalUI();
    renderNotesList();
    closeLockModal();
    showToast("设置已保存");
}

function updateLockModalUI() {
    const mode = userSettings.lockDisplayMode || 'all';
    const radioAll = document.getElementById('radio-lock-all');
    const radioOnly = document.getElementById('radio-lock-only');

    if (mode === 'all') {
        radioAll.classList.add('selected');
        radioOnly.classList.remove('selected');
    } else {
        radioAll.classList.remove('selected');
        radioOnly.classList.add('selected');
    }
}

/* ================= 4. 笔记列表与过滤器 ================= */
function renderNotesList() {
    const listContainer = document.getElementById('notes-list');
    listContainer.innerHTML = '';

    let filtered = notes.filter(n => !n.isDeleted);

    // 加锁过滤逻辑
    if (userSettings.lockDisplayMode === 'locked_only') {
        if (currentFolder === '已加锁') {
            filtered = filtered.filter(n => n.isLocked);
        } else {
            filtered = filtered.filter(n => !n.isLocked);
        }
    } else {
        if (currentFolder === '已加锁') {
            filtered = filtered.filter(n => n.isLocked);
        } else if (currentFolder !== '全部分类') {
            filtered = filtered.filter(n => n.folder === currentFolder);
        }
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding: 40px; color: #8e8e93;">暂无笔记</div>`;
        return;
    }

    filtered.forEach(note => {
        const item = document.createElement('div');
        item.className = 'note-item';
        item.onclick = () => openEditor(note.id);

        item.innerHTML = `
            <div class="note-title">${note.isLocked ? '🔒 ' : ''}${note.title || '无标题'}</div>
            <div class="note-meta">${note.updatedAt} | ${note.content.length}字 | ${note.folder || '未分类'}</div>
        `;
        listContainer.appendChild(item);
    });
}

/* ================= 5. 编辑器核心逻辑 (对标图2布局) ================= */
function openEditor(noteId = null) {
    currentNoteId = noteId;
    const editorView = document.getElementById('editor-view');
    const titleInput = document.getElementById('note-title-input');
    const contentEditor = document.getElementById('note-content-editor');
    const datetimeTag = document.getElementById('editor-datetime-tag');
    const folderTag = document.getElementById('editor-folder-select-tag');

    if (noteId) {
        const note = notes.find(n => n.id === noteId);
        titleInput.value = note.title;
        contentEditor.innerHTML = note.content;
        datetimeTag.textContent = note.updatedAt;
        folderTag.textContent = (note.folder || '未分类') + ' ⌵';
    } else {
        titleInput.value = '';
        contentEditor.innerHTML = '';
        const nowStr = formatNowDate();
        datetimeTag.textContent = nowStr;
        folderTag.textContent = (currentFolder === '全部分类' ? '未分类' : currentFolder) + ' ⌵';
    }

    updateEditorWordCount();
    document.getElementById('editor-format-panel').classList.remove('open');
    document.getElementById('btn-toggle-aa').classList.remove('active');
    editorView.style.display = 'block';
}

function onEditorInput() {
    updateEditorWordCount();
}

function updateEditorWordCount() {
    const text = document.getElementById('note-content-editor').innerText || '';
    const cleanText = text.replace(/\s+/g, '');
    document.getElementById('editor-wordcount-tag').textContent = `${cleanText.length}字`;
}

function saveNote() {
    const title = document.getElementById('note-title-input').value.trim();
    const content = document.getElementById('note-content-editor').innerHTML.trim();
    const folderText = document.getElementById('editor-folder-select-tag').textContent.replace(' ⌵', '');

    if (!title && !content) {
        closeEditor();
        return;
    }

    const nowStr = formatNowDate();

    if (currentNoteId) {
        const note = notes.find(n => n.id === currentNoteId);
        if (note) {
            note.title = title || '未命名笔记';
            note.content = content;
            note.updatedAt = nowStr;
            note.folder = folderText;
        }
    } else {
        const newNote = {
            id: 'note_' + Date.now(),
            title: title || '未命名笔记',
            content: content,
            updatedAt: nowStr,
            folder: folderText,
            isLocked: false,
            isPinned: false,
            isDeleted: false
        };
        notes.unshift(newNote);
    }

    localStorage.setItem('cloud_notes_data', JSON.stringify(notes));
    closeEditor();
    renderNotesList();
    updateCreationStats();
}

function closeEditor() {
    document.getElementById('editor-view').style.display = 'none';
}

/* ================= 6. 排版面板 (Aa 点击处理，彻底防遮挡) ================= */
function toggleAaPanel() {
    const panel = document.getElementById('editor-format-panel');
    const btn = document.getElementById('btn-toggle-aa');
    const isOpen = panel.classList.contains('open');

    if (isOpen) {
        panel.classList.remove('open');
        btn.classList.remove('active');
    } else {
        panel.classList.add('open');
        btn.classList.add('active');
    }
}

function formatDoc(cmd, value = null) {
    document.execCommand(cmd, false, value);
}

function setEditorFontSize(sizePx, el) {
    document.querySelectorAll('.size-opt').forEach(opt => opt.classList.remove('active'));
    if (el) el.classList.add('active');
    document.execCommand('fontSize', false, '4'); // 标尺基准
}

function setEditorColor(colorHex, el) {
    document.querySelectorAll('.color-block').forEach(b => {
        b.classList.remove('active');
        b.textContent = '';
    });
    if (el) {
        el.classList.add('active');
        el.textContent = '✓';
    }
    document.execCommand('foreColor', false, colorHex);
}

function toggleHighlight() {
    document.execCommand('backColor', false, '#fff59d');
}

function insertChecklist() {
    document.execCommand('insertHTML', false, '<input type="checkbox"> &nbsp;');
}

/* 图片选择与加载 */
function triggerNoteImageSelect() {
    document.getElementById('note-image-file-input').click();
}

function uploadNoteImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.execCommand('insertImage', false, e.target.result);
        };
        reader.readAsDataURL(input.files[0]);
    }
}

/* 编辑器内选择分类 */
function selectFolderForCurrentNote() {
    const availableFolders = folders.filter(f => f !== '全部分类' && f !== '已加锁');
    let msg = "选择保存分类：\n" + availableFolders.map((f, i) => `${i + 1}. ${f}`).join('\n');
    let choice = prompt(msg, "1");
    if (choice) {
        let index = parseInt(choice) - 1;
        if (availableFolders[index]) {
            document.getElementById('editor-folder-select-tag').textContent = availableFolders[index] + ' ⌵';
        }
    }
}

/* 格式化当前时间 */
function formatNowDate() {
    const d = new Date();
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ================= 7. 统计与子视图导航 ================= */
function updateCreationStats() {
    const activeNotes = notes.filter(n => !n.isDeleted);
    document.getElementById('stat-notes-count').textContent = activeNotes.length;

    let totalWords = 0;
    activeNotes.forEach(n => {
        const plainText = n.content.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
        totalWords += plainText.length;
    });
    document.getElementById('stat-words-count').textContent = totalWords;

    const trash = notes.filter(n => n.isDeleted);
    document.getElementById('trash-count-display').textContent = trash.length;
}

function openSubView(id) {
    document.getElementById(id).style.display = 'block';
    if (id === 'trash-view') renderTrashList();
}

function closeSubView(id) {
    document.getElementById(id).style.display = 'none';
}

function renderTrashList() {
    const trashContainer = document.getElementById('trash-list');
    const trash = notes.filter(n => n.isDeleted);
    trashContainer.innerHTML = '';

    if (trash.length === 0) {
        trashContainer.innerHTML = `<div style="text-align:center; padding: 30px; color:#8e8e93;">最近删除为空</div>`;
        return;
    }

    trash.forEach(n => {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';

        div.innerHTML = `
            <div>
                <div class="note-title">${n.title}</div>
                <div class="note-meta">${n.updatedAt}</div>
            </div>
            <button onclick="restoreNote('${n.id}')" style="color:var(--ios-yellow); border:none; background:none; font-weight:bold;">恢复</button>
        `;
        trashContainer.appendChild(div);
    });
}

function restoreNote(id) {
    const note = notes.find(n => n.id === id);
    if (note) {
        note.isDeleted = false;
        localStorage.setItem('cloud_notes_data', JSON.stringify(notes));
        renderTrashList();
        updateCreationStats();
        showToast("已恢复");
    }
}

function clearAllTrash() {
    notes = notes.filter(n => !n.isDeleted);
    localStorage.setItem('cloud_notes_data', JSON.stringify(notes));
    renderTrashList();
    updateCreationStats();
    showToast("垃圾桶已清空");
}

/* ================= 8. 侧边栏及 Auth 模态框 ================= */
function toggleSidebar(open) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (open) {
        sidebar.classList.add('open');
        overlay.style.display = 'block';
    } else {
        sidebar.classList.remove('open');
        overlay.style.display = 'none';
    }
}

function renderSidebarFolders() {
    const container = document.getElementById('sidebar-menu-list');
    container.innerHTML = '';

    folders.forEach(f => {
        const item = document.createElement('div');
        item.className = `sidebar-item ${currentFolder === f ? 'active' : ''}`;
        item.textContent = f;
        item.onclick = () => {
            currentFolder = f;
            document.getElementById('page-title').textContent = f;
            renderSidebarFolders();
            renderNotesList();
            toggleSidebar(false);
        };
        container.appendChild(item);
    });
}

function createNewFolder() {
    const name = prompt("请输入新文件夹名称：");
    if (name && !folders.includes(name)) {
        folders.push(name);
        localStorage.setItem('cloud_folders_data', JSON.stringify(folders));
        renderSidebarFolders();
    }
}

function handleAuthButtonClick() {
    if (currentUser.isLoggedIn) {
        if (confirm("确定要退出登录吗？")) {
            currentUser = {
                username: '游客模式',
                nickname: '写笔记的小卡拉米',
                avatar: 'https://via.placeholder.com/100/e5a000/ffffff?text=User',
                isLoggedIn: false
            };
            saveUserProfile();
            updateUserProfileUI();
            showToast("已退出登录");
        }
    } else {
        document.getElementById('auth-modal-overlay').style.display = 'block';
        document.getElementById('auth-card').style.display = 'block';
    }
}

function closeAuthModal() {
    document.getElementById('auth-modal-overlay').style.display = 'none';
    document.getElementById('auth-card').style.display = 'none';
}

function submitAuth() {
    const usernameInput = document.getElementById('auth-username').value.trim();
    if (usernameInput) {
        currentUser.username = usernameInput;
        currentUser.nickname = usernameInput;
        currentUser.isLoggedIn = true;
        saveUserProfile();
        updateUserProfileUI();
        closeAuthModal();
        showToast("登录成功");
    }
}