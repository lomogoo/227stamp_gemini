/* 1) Supabase 初期化 */
const { createClient } = window.supabase;
const db = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

/* 2) グローバル変数 */
let globalUID = null;
let html5QrCode = null;

const appData = {
  qrString: "ROUTE227_STAMP_2025"
};

/* 3) メイン処理 */
document.addEventListener('DOMContentLoaded', () => {
  setupStaticEventListeners();

  db.auth.onAuthStateChange(async (event, session) => {
    const appLoader = document.getElementById('app-loader');
    appLoader.classList.add('active');
    
    // ★★★ onAuthStateChange全体の処理をtry...catchで囲む ★★★
    try {
      globalUID = session?.user?.id || null;
      updateUserStatus(session);

      const activeSectionId = document.querySelector('.section.active')?.id || 'feed-section';
      await showSection(activeSectionId, true);
    } catch (error) {
      console.error("onAuthStateChangeで致命的なエラー:", error);
      showNotification("重大なエラー", "アプリの初期化に失敗しました。ページをリロードしてください。");
    } finally {
      appLoader.classList.remove('active');
    }
  });
});

/* 4) ナビゲーションと表示切替 */
function setupStaticEventListeners() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const sectionId = e.currentTarget.dataset.section;
      showSection(sectionId);
    });
  });

  const loginForm = document.getElementById('login-form');
  if(loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('email');
      const msgEl = document.getElementById('login-message');
      msgEl.textContent = '送信中...';
      
      // ★★★ リダイレクトURLをより安全なものに修正 ★★★
      const redirectURL = window.location.origin + window.location.pathname;
      const { error } = await db.auth.signInWithOtp({ 
        email: emailInput.value.trim(), 
        options: { emailRedirectTo: redirectURL }
      });

      msgEl.textContent = error ? `❌ ${error.message}` : '✅ メールを確認してください！';
    });
  }
}

async function showSection(sectionId, isInitialLoad = false) {
  const appLoader = document.getElementById('app-loader');
  if(!isInitialLoad) appLoader.classList.add('active');

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.section === sectionId);
  });

  const sectionElement = document.getElementById(sectionId);
  if (sectionElement) {
    sectionElement.classList.add('active');
    if (sectionId === 'feed-section') {
      await initializeFeedPage();
    } else if (sectionId === 'foodtruck-section') {
      await initializeFoodtruckPage();
    }
  }
  if(!isInitialLoad) appLoader.classList.remove('active');
}

function updateUserStatus(session) {
  const userStatusDiv = document.getElementById('user-status');
  if (userStatusDiv) {
    if (session) {
      userStatusDiv.innerHTML = '<button id="logout-button" class="btn">ログアウト</button>';
      document.getElementById('logout-button').addEventListener('click', () => db.auth.signOut());
    } else {
      userStatusDiv.innerHTML = '';
    }
  }
}

/* 5) ページ別初期化ロジック */
async function initializeFeedPage() {
  await renderArticles('all');
  // イベントリスナーは一度だけ設定すれば良いように修正
  const categoryTabs = document.getElementById('category-tabs');
  if (!categoryTabs.dataset.listenerAttached) {
    categoryTabs.dataset.listenerAttached = 'true';
    categoryTabs.addEventListener('click', (e) => {
      if (e.target.classList.contains('category-tab')) {
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById('articles-container').innerHTML = '<div class="loading-spinner"></div>';
        renderArticles(e.target.dataset.category);
      }
    });
  }
}

async function initializeFoodtruckPage() {
  setupModalEventListeners();
  if (!globalUID) {
    document.getElementById('login-modal').classList.add('active');
    updateStampDisplay(0); // ログアウト時は0を表示
    updateRewardButtons(0);
    return;
  }
  try {
    const stampCount = await fetchOrCreateUserRow(globalUID);
    updateStampDisplay(stampCount);
    updateRewardButtons(stampCount);
    setupFoodtruckActionListeners();
  } catch(error) {
    // fetchOrCreateUserRow内で通知される
    updateStampDisplay(0);
    updateRewardButtons(0);
  }
}

function setupFoodtruckActionListeners() {
    document.getElementById('scan-qr')?.addEventListener('click', () => initQRScanner());
    document.getElementById('coffee-reward')?.addEventListener('click', () => redeemReward('coffee'));
    document.getElementById('curry-reward')?.addEventListener('click', () => redeemReward('curry'));
}

function setupModalEventListeners() {
  document.querySelectorAll('.modal').forEach(modal => {
    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn && !closeBtn.dataset.listenerAttached) {
      closeBtn.dataset.listenerAttached = 'true';
      closeBtn.addEventListener('click', () => closeModal(modal));
    }
    const closeNotifBtn = modal.querySelector('.close-notification');
     if (closeNotifBtn && !closeNotifBtn.dataset.listenerAttached) {
      closeNotifBtn.dataset.listenerAttached = 'true';
      closeNotifBtn.addEventListener('click', () => closeModal(document.getElementById('notification-modal')));
    }
  });
}

function closeModal(modalElement) {
    if(!modalElement) return;
    modalElement.classList.remove('active');
    if (modalElement.id === 'qr-modal' && html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
    }
}


/* 6) ヘルパー関数群 */
async function fetchOrCreateUserRow(uid) {
  try {
    const { data, error } = await db.from('users').select('stamp_count').eq('supabase_uid', uid).maybeSingle();
    if (error) throw error;
    if (data) return data.stamp_count;
    const { data: inserted, error: iErr } = await db.from('users').insert([{ supabase_uid: uid, stamp_count: 0 }]).select().single();
    if (iErr) throw iErr;
    return inserted.stamp_count;
  } catch (err) {
    showNotification('エラー', 'ユーザー情報の取得に失敗しました。ページをリロードしてください。');
    throw err;
  }
}

async function updateStampCount(uid, newCount) {
  const { data, error } = await db.from('users').update({ stamp_count: newCount, updated_at: new Date().toISOString() }).eq('supabase_uid', uid).select().single();
  if (error) throw error;
  return data.stamp_count;
}

function updateStampDisplay(count) {
  document.querySelectorAll('.stamp').forEach((el, i) => el.classList.toggle('active', i < count));
}

function updateRewardButtons(count) {
  const coffeeBtn = document.getElementById('coffee-reward');
  const curryBtn = document.getElementById('curry-reward');
  const coffeeItem = document.getElementById('coffee-reward-item');
  const curryItem = document.getElementById('curry-reward-item');

  if (coffeeBtn) coffeeBtn.disabled = count < 3;
  if (curryBtn) curryBtn.disabled = count < 6;
  coffeeItem?.classList.toggle('available', count >= 3);
  curryItem?.classList.toggle('available', count >= 6);
}

function showNotification(title, msg) {
  const modal = document.getElementById('notification-modal');
  document.getElementById('notification-title').textContent = title;
  document.getElementById('notification-message').textContent = msg;
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
      if (html5QrCode.isScanning) {
          await html5QrCode.stop();
      }
      closeModal(qrModal);
      if (decodedText === appData.qrString) {
        await addStamp();
      } else {
        showNotification('無効なQR', 'お店のQRコードではありません。');
      }
    },
    (errorMessage) => { /* ignore */ }
  ).catch(() => document.getElementById('qr-reader').innerHTML = '<p style="color: red;">カメラの起動に失敗しました</p>');
}

async function renderArticles(category) {
  const articlesContainer = document.getElementById('articles-container');
  if (!articlesContainer) return;
  articlesContainer.innerHTML = '<div class="loading-spinner"></div>';
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
      div.className = 'card';
      div.innerHTML = `<a href="${a.url}" target="_blank" rel="noopener noreferrer"><img src="${a.img}" alt="${a.title}のサムネイル" loading="lazy"><div class="card-body"><h3 class="article-title">${a.title}</h3><p class="article-excerpt">${a.summary}</p></div></a>`;
      articlesContainer.appendChild(div);
    });
  } catch (error) {
    articlesContainer.innerHTML = '<div class="status status--error">記事の読み込みに失敗しました。</div>';
  }
}
