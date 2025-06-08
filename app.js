/* 1) Supabase 初期化 */
const { createClient } = window.supabase;
const db = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

/* 2) グローバル変数 & データ */
let globalUID = null;
let html5QrCode = null;

const appData = {
  qrString: "ROUTE227_STAMP_2025"
};

const articles = [
    { 
      id: 0,
      scraping_url:'https://machico.mu/special/detail/2691',
      article_url: 'https://machico.mu/special/detail/2691',
      category:'イベント',
      title:'🏮仙臺横丁フェス 2025',
      summary:'昭和の賑わいを公園で再現！赤ちょうちん、昭和歌謡、屋台グルメが並ぶ雰囲気満点のフェス。',
      summary_points: [
          '**開催日時**: 2025年6月13日(金)〜15日(日)',
          '**場所**: 勾当台公園 市民広場＆いこいのゾーン',
          '**特徴**: 入場無料で、専用グラス(500円)片手に横丁の世界を体感！',
          '**特典**: machicoユーザー限定で500円食券が当たるチャンスも！'
      ]
    },
  { 

    id: 1,
    scraping_url: 'https://machico.mu/special/detail/2704',
    article_url: 'https://machico.mu/special/detail/2704',
    category: 'イベント',
    title: '🌿バル仙台 2025｜杜の都で味わう東北ワインフェス',
    summary: '東北ワインと欧州グルメが集う、勾当台公園の屋外フェス。コメント投稿やマチコインで500円券ゲットのチャンスあり！',
    summary_points: [
    '**開催日時**: 2025年6月20日(金)〜22日(日)、20日16:00〜21:00／21日11:00〜21:00／22日11:00〜19:00',
    '**場所**: 勾当台公園 いこいの広場',
    '**内容**: 東北ワイナリー＆輸入ワインの飲み比べ、東北食材×欧州料理が楽しめる',
    '**入場料**: 無料（専用グラス購入で飲食可）',
    '**特典**: コメント投稿・マチコイン交換・QRくじで500円食券ゲットのチャンスあり'
    ]
  },
  
  { 
      id: 2,
      scraping_url:'https://machico.mu/jump/ad/102236',
      article_url: 'https://www.sendai-jinjacho.jp/',
      category:'ニュース', 
      title:'宮城県神社庁からのお知らせ',
      summary:'季節の祭事や神社の豆知識など、私たちの暮らしに身近な情報をお届けします。',
      summary_points: [
          '**夏越の大祓**: 半年の穢れを祓い、無病息災を祈る神事のご案内。',
          '**七五三詣**: お子様の健やかな成長を願う七五三の準備について。',
          '**神社の作法**: 知っているようで知らない？参拝の基本を解説。',
      ]
    },
    { 
      id: 3,
      scraping_url:'https://machico.mu/special/detail/2926',
      article_url: 'https://machico.mu/special/detail/2926',
      category:'ニュース', 
      title:'仙台の新しい魅力を発見！',
      summary:'注目の新店舗から、地元で愛される隠れた名店まで。次の週末のお出かけ先にいかが？',
      summary_points: [
          '**ニューオープン**: 話題のカフェやレストランの最新情報。',
          '**再発見**: 地元ライターがおすすめする、通なスポットを紹介。',
          '**テイクアウト**: お家で楽しめる絶品グルメ特集。'
      ]
    }
  ];

/* 3) メイン処理 */
document.addEventListener('DOMContentLoaded', () => {
  setupStaticEventListeners();

  db.auth.onAuthStateChange(async (event, session) => {
    const appLoader = document.getElementById('app-loader');
    appLoader.classList.add('active');
    
    try {
      globalUID = session?.user?.id || null;
      updateUserStatus(session);
      const activeSectionId = document.querySelector('.section.active')?.id || 'feed-section';
      await showSection(activeSectionId, true);
    } catch (error) {
      console.error("onAuthStateChangeで致命的なエラーが発生しました:", error);
      showNotification("重大なエラー", "アプリの初期化に失敗しました。");
    } finally {
      appLoader.classList.remove('active');
    }
  });
});

/* 4) ナビゲーションと表示切替 */
function setupStaticEventListeners() {
  // フッターナビゲーションのリンクに対するイベントリスナー
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      showSection(e.currentTarget.dataset.section);
    });
  });

  // ログインフォームに対するイベントリスナー
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('email');
      const msgEl = document.getElementById('login-message');
      const submitButton = loginForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = '送信中...';
      msgEl.textContent = '';
      try {
        const redirectURL = window.location.origin + window.location.pathname;
        const { error } = await db.auth.signInWithOtp({ email: emailInput.value.trim(), options: { emailRedirectTo: redirectURL } });
        msgEl.textContent = error ? `❌ ${error.message}` : '✅ メールを確認してください！';
        if (!error) emailInput.value = '';
      } catch (err) {
        msgEl.textContent = `❌ 予期せぬエラーが発生しました。`;
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Magic Link を送信';
      }
    });
  }

  // ★★★ 修正点：モーダルを閉じる処理をここに集約 ★★★
  // body全体でクリックを監視し、閉じるボタンが押されたかを判断する（イベント委譲）
  document.body.addEventListener('click', (e) => {
    if (e.target.matches('.close-modal') || e.target.matches('.close-notification')) {
      const modal = e.target.closest('.modal');
      if (modal) {
        closeModal(modal);
      }
    }
  });
}

async function showSection(sectionId, isInitialLoad = false) {
  const appLoader = document.getElementById('app-loader');
  if (!isInitialLoad) appLoader.classList.add('active');

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.section === sectionId);
  });

  const sectionElement = document.getElementById(sectionId);
  if (sectionElement) {
    sectionElement.classList.add('active');
    if (sectionId === 'feed-section') await initializeFeedPage();
    else if (sectionId === 'foodtruck-section') await initializeFoodtruckPage();
  }
  if (!isInitialLoad) appLoader.classList.remove('active');
}

function updateUserStatus(session) {
  const userStatusDiv = document.getElementById('user-status');
  if (userStatusDiv) {
    userStatusDiv.innerHTML = session ? '<button id="logout-button" class="btn">ログアウト</button>' : '';
    if (session) document.getElementById('logout-button').addEventListener('click', () => db.auth.signOut());
  }
}

/* 5) ページ別初期化ロジック */
async function initializeFeedPage() {
  await renderArticles('all');
  const categoryTabs = document.getElementById('category-tabs');
  if (categoryTabs && !categoryTabs.dataset.listenerAttached) {
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
  // ★★★ 修正点：モーダル設定の呼び出しを削除 ★★★
  // setupModalEventListeners(); // ← この行を削除

  if (!globalUID) {
    document.getElementById('login-modal').classList.add('active');
    updateStampDisplay(0);
    updateRewardButtons(0);
    return;
  }
  try {
    const stampCount = await fetchUserRow(globalUID);
    updateStampDisplay(stampCount);
    updateRewardButtons(stampCount);
    setupFoodtruckActionListeners();
  } catch(error) {
    updateStampDisplay(0);
    updateRewardButtons(0);
  }
}

function setupFoodtruckActionListeners() {
    document.getElementById('scan-qr')?.addEventListener('click', initQRScanner);
    document.getElementById('coffee-reward')?.addEventListener('click', () => redeemReward('coffee'));
    document.getElementById('curry-reward')?.addEventListener('click', () => redeemReward('curry'));
}

function closeModal(modalElement) {
    if(!modalElement) return;
    modalElement.classList.remove('active');
    if (modalElement.id === 'qr-modal' && html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
    }
}

/* 6) ヘルパー関数群 */
async function fetchUserRow(uid) {
  try {
    const { data, error } = await db.from('users').select('stamp_count').eq('supabase_uid', uid).maybeSingle();
    if (error) throw error;
    if (data) return data.stamp_count;
    const { error: insertError } = await db.from('users').insert({ supabase_uid: uid, stamp_count: 0 });
    if (insertError) throw insertError;
    return 0;
  } catch (err) {
    showNotification('エラー', 'ユーザー情報の取得に失敗しました。');
    throw err;
  }
}

async function updateStampCount(uid, newCount) {
  try {
    const { data, error } = await db.from('users').update({ stamp_count: newCount, updated_at: new Date().toISOString() }).eq('supabase_uid', uid).select().single();
    if (error) throw error;
    return data.stamp_count;
  } catch(err) {
    showNotification('エラー', 'スタンプの保存に失敗しました。');
    throw err;
  }
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
  if (!globalUID) return;
  try {
    let count = await fetchUserRow(globalUID);
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
  if (!globalUID) return;
  try {
    let count = await fetchUserRow(globalUID);
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
      if (html5QrCode.isScanning) await html5QrCode.stop();
      closeModal(qrModal);
      if (decodedText === appData.qrString) {
        await addStamp();
      } else {
        showNotification('無効なQR', 'お店のQRコードではありません。');
      }
    },
    (errorMessage) => {}
  ).catch(() => document.getElementById('qr-reader').innerHTML = '<p style="color: red;">カメラの起動に失敗しました</p>');
}

async function renderArticles(category) {
  const articlesContainer = document.getElementById('articles-container');
  if (!articlesContainer) return;
  articlesContainer.innerHTML = '<div class="loading-spinner"></div>';
  
  const targets = articles.filter(a => category === 'all' || a.category === category);
  
  try {
    const cards = await Promise.all(targets.map(async a => {
      try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(a.scraping_url)}`);
        if (!res.ok) return { ...a, img: 'assets/placeholder.jpg' };
        const d = await res.json();
        const doc = new DOMParser().parseFromString(d.contents, 'text/html');
        return { ...a, img: doc.querySelector("meta[property='og:image']")?.content || 'assets/placeholder.jpg' };
      } catch {
        return { ...a, img: 'assets/placeholder.jpg' };
      }
    }));

    articlesContainer.innerHTML = '';
    cards.forEach(cardData => {
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <div class="article-link" data-article-id="${cardData.id}" role="button" tabindex="0">
          <img src="${cardData.img}" alt="${cardData.title}のサムネイル" loading="lazy">
          <div class="card-body">
            <h3 class="article-title">${cardData.title}</h3>
            <p class="article-excerpt">${cardData.summary}</p>
          </div>
        </div>`;
      articlesContainer.appendChild(div);
    });

    document.querySelectorAll('.article-link').forEach(link => {
      link.addEventListener('click', (e) => {
        const articleId = e.currentTarget.dataset.articleId;
        showSummaryModal(parseInt(articleId, 10));
      });
    });
  } catch (error) {
    articlesContainer.innerHTML = '<div class="status status--error">記事の読み込みに失敗しました。</div>';
  }
}

function showSummaryModal(articleId) {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;

    const modal = document.getElementById('summary-modal');
    const imgEl = document.getElementById('summary-image');
    const titleEl = document.getElementById('summary-title');
    const bulletsEl = document.getElementById('summary-bullets');
    const readMoreBtn = document.getElementById('summary-read-more');

    const cardImage = document.querySelector(`[data-article-id="${articleId}"] img`);
    imgEl.style.backgroundImage = cardImage ? `url('${cardImage.src}')` : 'none';
    
    titleEl.textContent = article.title;
    bulletsEl.innerHTML = article.summary_points.map(point => `<li>${point.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('');
    readMoreBtn.href = article.article_url;

    modal.classList.add('active');
}
