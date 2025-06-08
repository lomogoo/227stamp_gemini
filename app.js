/* 1) Supabase 初期化 */
const { createClient } = window.supabase;
const db = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

/* 2) グローバル変数・定数 */
let globalUID = null;
let html5QrCode = null;
const BASE_PATH = '/227stamp'; // ★ GitHub Pagesのリポジトリ名

const appData = {
  qrString: "ROUTE227_STAMP_2025"
};

/* 3) ルーターとページ初期化 */

const pageInitializers = {
  feed: initializeFeedPage,
  foodtruck: initializeFoodtruckPage
};

// ページの読み込みと初期化を行うメイン関数
async function loadPage(path) {
  const contentContainer = document.getElementById('content-container');
  if (!contentContainer) return;
  contentContainer.innerHTML = '<div class="loading-spinner"></div>';

  try {
    // ★絶対パスでHTMLをフェッチ
    const response = await fetch(`${BASE_PATH}/pages/${path}.html`);
    if (!response.ok) throw new Error(`Page not found: ${response.statusText}`);
    
    contentContainer.innerHTML = await response.text();
    
    if (pageInitializers[path]) {
      await pageInitializers[path]();
    }
  } catch (error) {
    console.error('Failed to load page:', error);
    contentContainer.innerHTML = `<div class="status status--error">ページの読み込みに失敗しました。<br>${error.message}</div>`;
  }
}

// フィードページの初期化ロジック
async function initializeFeedPage() {
  await renderArticles('all');
  // カテゴリタブのリスナーを設定
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      e.currentTarget.classList.add('active');
      document.getElementById('articles-container').innerHTML = '<div class="loading-spinner"></div>';
      renderArticles(e.currentTarget.dataset.category);
    });
  });
}

// フードトラックページの初期化ロジック
async function initializeFoodtruckPage() {
  setupModalEventListeners(); // 先にモーダルのリスナーを設定
  if (!globalUID) {
    document.getElementById('login-modal')?.classList.add('active');
    return;
  }
  const stampCount = await fetchOrCreateUserRow(globalUID);
  updateStampDisplay(stampCount);
  updateRewardButtons(stampCount);
  setupFoodtruckActionListeners();
}

/* 4) メイン処理 */

// URLのパスから現在のページを判断する関数
function getCurrentPath() {
    let path = window.location.pathname.replace(BASE_PATH, '').replace('/', '');
    return path || 'feed';
}

document.addEventListener('DOMContentLoaded', () => {
  const appLoader = document.getElementById('app-loader');

  // 認証状態の変更を監視
  db.auth.onAuthStateChange(async (event, session) => {
    appLoader.classList.add('active');
    globalUID = session?.user?.id || null;
    updateUserStatus(session);
    
    await loadPage(getCurrentPath());
    updateActiveNavLink();
    
    appLoader.classList.remove('active');
  });

  // ナビゲーションリンクのクリックイベントを設定
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const path = e.currentTarget.dataset.path;
      const fullPath = (path === 'feed') ? `${BASE_PATH}/` : `${BASE_PATH}/${path}`;
      window.history.pushState({ path }, '', fullPath);
      loadPage(path);
      updateActiveNavLink();
    });
  });
  
  // ブラウザの「戻る」「進む」ボタンに対応
  window.addEventListener('popstate', () => {
    loadPage(getCurrentPath());
    updateActiveNavLink();
  });
});

function updateActiveNavLink() {
    const currentPath = getCurrentPath();
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active', l.dataset.path === currentPath);
    });
}


/* 5) ページ別イベントリスナー設定 */
function setupModalEventListeners() {
  document.querySelectorAll('.modal').forEach(modal => {
    modal.querySelector('.close-modal')?.addEventListener('click', () => closeModal(modal));
    modal.querySelector('.close-notification')?.addEventListener('click', () => closeModal(modal));
  });
  
  const loginForm = document.getElementById('login-form');
  if(loginForm) {
      loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href }});
      document.getElementById('login-message').textContent = error ? '❌ 送信失敗' : '✅ メールを確認！';
    });
  }
}

function setupFoodtruckActionListeners() {
    document.getElementById('scan-qr')?.addEventListener('click', () => initQRScanner());
    document.getElementById('coffee-reward')?.addEventListener('click', () => redeemReward('coffee'));
    document.getElementById('curry-reward')?.addEventListener('click', () => redeemReward('curry'));
}

/* 6) ヘルパー関数群（安定版） */

function updateUserStatus(session) {
    const userStatusDiv = document.getElementById('user-status');
    if(!userStatusDiv) return;
    if (session) {
        userStatusDiv.innerHTML = '<button id="logout-button" class="btn btn--sm btn--outline">ログアウト</button>';
        document.getElementById('logout-button').addEventListener('click', () => db.auth.signOut());
    } else {
        userStatusDiv.innerHTML = '';
    }
}

async function fetchOrCreateUserRow(uid) {
  try {
    const { data, error } = await db.from('users').select('stamp_count').eq('supabase_uid', uid).maybeSingle();
    if (error) throw error;
    if (data) return data.stamp_count;
    const { data: inserted, error: iErr } = await db.from('users').insert([{ supabase_uid: uid, stamp_count: 0 }]).select().single();
    if (iErr) throw iErr;
    return inserted.stamp_count;
  } catch (err) {
    showNotification('エラー', 'ユーザー情報の取得に失敗しました。');
    throw err;
  }
}

async function updateStampCount(uid, newCount) {
  const { data, error } = await db.from('users').update({ stamp_count: newCount }).eq('supabase_uid', uid).select().single();
  if (error) throw error;
  return data.stamp_count;
}

function updateStampDisplay(count) {
  document.querySelectorAll('.stamp').forEach((el, i) => el.classList.toggle('active', i < count));
}

function updateRewardButtons(count) {
  const coffeeBtn = document.getElementById('coffee-reward');
  const curryBtn = document.getElementById('curry-reward');
  if (coffeeBtn) coffeeBtn.disabled = count < 3;
  if (curryBtn) curryBtn.disabled = count < 6;
}

function showNotification(title, msg) {
  const modal = document.getElementById('notification-modal');
  const titleEl = document.getElementById('notification-title');
  const msgEl = document.getElementById('notification-message');
  if(titleEl) titleEl.textContent = title;
  if(msgEl) msgEl.textContent = msg;
  modal?.classList.add('active');
}

async function addStamp() {
  try {
    let count = await fetchOrCreateUserRow(globalUID);
    if (count >= 6) return showNotification('コンプリート！', 'スタンプが6個たまりました！');
    count = await updateStampCount(globalUID, count + 1);
    updateStampDisplay(count);
    updateRewardButtons(count);
    if (count === 3 || count === 6) showNotification('🎉', count === 3 ? 'コーヒー1杯無料！' : 'カレー1杯無料！');
    else showNotification('スタンプ獲得', `現在 ${count} 個`);
  } catch (error) {
    showNotification('エラー', 'スタンプの追加に失敗しました。');
  }
}

async function redeemReward(type) {
  try {
    let count = await fetchOrCreateUserRow(globalUID);
    const required = type === 'coffee' ? 3 : 6;
    if (count < required) return;
    count = await updateStampCount(globalUID, count - required);
    updateStampDisplay(count);
    updateRewardButtons(count);
    showNotification('交換完了', `${type === 'coffee' ? 'コーヒー' : 'カレー'}と交換しました！`);
  } catch (error) {
    showNotification('エラー', '特典の交換に失敗しました。');
  }
}

function initQRScanner() {
  const qrModal = document.getElementById('qr-modal');
  qrModal?.classList.add('active');
  let isProcessing = false;
  html5QrCode = new Html5Qrcode('qr-reader');
  html5QrCode.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 250, height: 250 } },
    async (decodedText) => {
      if (isProcessing) return;
      isProcessing = true;
      await html5QrCode.stop();
      closeModal(qrModal);
      if (decodedText === appData.qrString) {
        await addStamp();
      } else {
        showNotification('無効なQR', 'お店のQRコードではありません。');
      }
    },
    () => {}
  ).catch(() => document.getElementById('qr-reader').innerHTML = '<p class="status status--error">カメラの起動に失敗</p>');
}

function closeModal(modalElement) {
    if(!modalElement) return;
    modalElement.classList.remove('active');
    if (modalElement.id === 'qr-modal' && html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
    }
}

async function renderArticles(category) {
  const articlesContainer = document.getElementById('articles-container');
  if (!articlesContainer) return;
  const list = [
    { url:'https://machico.mu/special/detail/2691',category:'イベント',title:'Machico 2691',summary:'イベント記事' },
    { url:'https://machico.mu/special/detail/2704',category:'イベント',title:'Machico 2704',summary:'イベント記事' },
    { url:'https://machico.mu/jump/ad/102236',      category:'ニュース', title:'Machico 102236',summary:'ニュース記事' },
    { url:'https://machico.mu/special/detail/2926', category:'ニュース', title:'Machico 2926',summary:'ニュース記事' }
  ];
  const targets = list.filter(a => category === 'all' || a.category === category);
  try {
    const cards = await Promise.all(targets.map(async a => {
      try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(a.url)}`);
        if (!res.ok) return { ...a, img: 'assets/placeholder.jpg' };
        const d = await res.json();
        const doc = new DOMParser().parseFromString(d.contents, 'text/html');
        return { ...a, img: doc.querySelector("meta[property='og:image']")?.content || 'assets/placeholder.jpg' };
      } catch {
        return { ...a, img: 'assets/placeholder.jpg' };
      }
    }));
    articlesContainer.innerHTML = '';
    cards.forEach(a => {
      const div = document.createElement('div');
      div.className = 'card article-card';
      div.innerHTML = `<a href="${a.url}" target="_blank" rel="noopener noreferrer"><img src="${a.img}" alt="${a.title}のサムネイル" loading="lazy"><div class="card__body"><span class="article-category">${a.category}</span><h3 class="article-title">${a.title}</h3><p class="article-excerpt">${a.summary}</p></div></a>`;
      articlesContainer.appendChild(div);
    });
  } catch (error) {
    articlesContainer.innerHTML = '<div class="status status--error">記事の読み込みに失敗しました。</div>';
  }
}
