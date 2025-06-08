/* 1) Supabase 初期化 */
const { createClient } = window.supabase;
const db = createClient(
  'https://hccairtzksnnqdujalgv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjY2FpcnR6a3NubnFkdWphbGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNjI2MTYsImV4cCI6MjA2NDgzODYxNn0.TVDucIs5ClTWuykg_fy4yv65Rg-xbSIPFIfvIYawy_k'
);

/* 2) グローバル変数 */
let globalUID = null;
let html5QrCode = null;
let articlesCache = [];
let masonry = null;
let scrollObserver = null;

const ARTICLES_PER_PAGE = 10;
let currentPage = 0;
let currentCategory = 'all';
let isLoadingMore = false;

const appData = {
  qrString: "ROUTE227_STAMP_2025"
};

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
      setTimeout(() => appLoader.classList.remove('active'), 300);
    }
  });
});

/* 4) ナビゲーションと表示切替 */
function setupStaticEventListeners() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      showSection(e.currentTarget.dataset.section);
    });
  });
  
  document.getElementById('load-more-btn')?.addEventListener('click', () => {
    if (isLoadingMore) return;
    currentPage++;
    renderArticles(currentCategory, false);
  });

  const emailForm = document.getElementById('email-form');
  const otpForm = document.getElementById('otp-form');
  const emailInput = document.getElementById('email');
  const otpCodeInput = document.getElementById('otp-code');
  const emailMessage = document.getElementById('email-message');
  const otpMessage = document.getElementById('otp-message');
  const otpEmailDisplay = document.getElementById('otp-email-display');
  const changeEmailBtn = document.getElementById('change-email-btn');

  emailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const submitButton = emailForm.querySelector('button[type="submit"]');
    
    submitButton.disabled = true;
    submitButton.textContent = '送信中...';
    emailMessage.textContent = '';

    try {
      const { error } = await db.auth.signInWithOtp({ 
        email: email, 
        options: { shouldCreateUser: true }
      });

      if (error) throw error;
      
      emailMessage.textContent = '✅ メールを確認してください！';
      otpEmailDisplay.textContent = email;
      emailForm.classList.add('hidden');
      otpForm.classList.remove('hidden');

    } catch (err) {
      emailMessage.textContent = `❌ ${err.message || 'エラーが発生しました。'}`;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = '認証コードを送信';
    }
  });

  otpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = otpEmailDisplay.textContent;
    const token = otpCodeInput.value.trim();
    const submitButton = otpForm.querySelector('button[type="submit"]');

    submitButton.disabled = true;
    submitButton.textContent = '認証中...';
    otpMessage.textContent = '';
    
    try {
      const { data, error } = await db.auth.verifyOtp({
        email: email,
        token: token,
        type: 'email'
      });
      if (error) throw error;
      
      closeModal(document.getElementById('login-modal'));

    } catch (err) {
      otpMessage.textContent = `❌ ${err.message || '認証に失敗しました。'}`;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = '認証する';
    }
  });
  
  changeEmailBtn?.addEventListener('click', () => {
    otpForm.classList.add('hidden');
    emailForm.classList.remove('hidden');
    emailMessage.textContent = '';
    otpMessage.textContent = '';
  });

  document.body.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (e.target.matches('.close-modal') || e.target.matches('.close-notification') || e.target.matches('.modal')) {
      if (modal) closeModal(modal);
    }
  });
}

async function showSection(sectionId, isInitialLoad = false) {
  const currentActive = document.querySelector('.section.active');
  const nextActive = document.getElementById(sectionId);

  if (currentActive === nextActive && !isInitialLoad) return;

  if (currentActive) {
    currentActive.classList.add('is-exiting');
    setTimeout(() => {
        currentActive.classList.remove('active', 'is-exiting');
    }, 500);
  }

  if (nextActive) {
    nextActive.classList.add('active');
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active', l.dataset.section === sectionId);
    });
    if (sectionId === 'feed-section') await initializeFeedPage();
    else if (sectionId === 'foodtruck-section') await initializeFoodtruckPage();
  }
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
  const categoryTabs = document.getElementById('category-tabs');
  if (categoryTabs && !categoryTabs.dataset.listenerAttached) {
    categoryTabs.dataset.listenerAttached = 'true';
    categoryTabs.addEventListener('click', (e) => {
      if (e.target.classList.contains('category-tab')) {
        currentPage = 0;
        currentCategory = e.target.dataset.category;
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        renderArticles(currentCategory, true);
      }
    });
  }

  const articlesContainer = document.getElementById('articles-container');
  if (!masonry) {
      masonry = new Masonry(articlesContainer, {
          itemSelector: '.card',
          columnWidth: '.card',
          percentPosition: true,
          gutter: 0
      });
  }

  if (!scrollObserver) {
    scrollObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: "0px 0px -100px 0px" });
  }
  
  currentPage = 0;
  currentCategory = document.querySelector('.category-tab.active')?.dataset.category || 'all';
  await renderArticles(currentCategory, true);
}

async function initializeFoodtruckPage() {
  if (!globalUID) {
    openModal(document.getElementById('login-modal'));
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

function openModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.add('active');
    gsap.fromTo(modalElement.querySelector('.modal-content'), 
        { y: 50, scale: 0.9, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: "back.out(1.7)" }
    );
}

function closeModal(modalElement) {
    if (!modalElement) return;
    
    gsap.to(modalElement.querySelector('.modal-content'), {
        y: -30,
        opacity: 0,
        duration: 0.3,
        ease: "power2.in",
        onComplete: () => {
            modalElement.classList.remove('active');
            if (modalElement.id === 'qr-modal' && html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(console.error);
            }
        }
    });
}

/* 6) ヘルパー関数群 */
async function fetchUserRow(uid) {
  try {
    const { data, error } = await db.from('users').select('stamp_count').eq('supabase_uid', uid).maybeSingle();
    if (error) throw error;
    if (data) return data.stamp_count;
    await new Promise(res => setTimeout(res, 500));
    const { data: secondTry, error: secondError } = await db.from('users').select('stamp_count').eq('supabase_uid', uid).single();
    if(secondError) throw secondError;
    return secondTry.stamp_count;
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
  openModal(modal);
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
  openModal(qrModal);
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

async function renderArticles(category, clearContainer) {
  const articlesContainer = document.getElementById('articles-container');
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (!articlesContainer || !loadMoreBtn) return;

  isLoadingMore = true;
  if (clearContainer) {
    if (masonry) {
        masonry.remove(articlesContainer.querySelectorAll('.card'));
        masonry.layout();
    }
    articlesContainer.innerHTML = '<div class="loading-spinner"></div>';
  } else {
    loadMoreBtn.textContent = '読み込み中...';
    loadMoreBtn.disabled = true;
  }

  try {
    const from = currentPage * ARTICLES_PER_PAGE;
    const to = from + ARTICLES_PER_PAGE - 1;

    let query = db.from('articles').select('*').order('created_at', { ascending: false }).range(from, to);
    if (category !== 'all') {
      query = query.eq('category', category);
    }
    
    const { data: newArticles, error } = await query;
    if (error) throw error;

    if (clearContainer) {
        articlesContainer.innerHTML = '';
        articlesCache = [];
    }
    
    articlesCache.push(...newArticles);

    const cards = await Promise.all(newArticles.map(async a => {
      try {
        const urlToScrape = a.scraping_url || a.article_url;
        const res = await promiseWithTimeout(
            fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(urlToScrape)}`),
            10000 
        );
        if (!res.ok) return { ...a, img: 'assets/placeholder.jpg' };
        const d = await res.json();
        const doc = new DOMParser().parseFromString(d.contents, 'text/html');
        return { ...a, img: doc.querySelector("meta[property='og:image']")?.content || 'assets/placeholder.jpg' };
      } catch (e) {
        console.error(`画像取得タイムアウトまたはエラー: ${a.title}`, e);
        return { ...a, img: 'assets/placeholder.jpg' };
      }
    }));

    if (cards.length === 0 && clearContainer) {
      articlesContainer.innerHTML = '<p style="text-align: center; padding: 20px;">記事はまだありません。</p>';
    } else {
      const fragment = document.createDocumentFragment();
      cards.forEach(cardData => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `
          <div class="article-link" data-article-id="${cardData.id}" role="button" tabindex="0">
            <img src="${cardData.img}" alt="${cardData.title}のサムネイル" loading="lazy">
            <h3 class="article-title">${cardData.title}</h3>
          </div>`;
        scrollObserver.observe(div);
        fragment.appendChild(div);
      });
      articlesContainer.appendChild(fragment);

      imagesLoaded( articlesContainer, function() {
        if(masonry) {
            masonry.appended(articlesContainer.querySelectorAll('.card:not(.masonry-item)'));
            masonry.layout();
        }
      });
    }

    if (newArticles.length < ARTICLES_PER_PAGE) {
      loadMoreBtn.style.display = 'none';
    } else {
      loadMoreBtn.style.display = 'inline-flex';
    }

    document.querySelectorAll('.article-link').forEach(link => {
      if(link.dataset.listenerAttached) return;
      link.dataset.listenerAttached = 'true';
      link.addEventListener('click', (e) => {
        const articleId = e.currentTarget.dataset.articleId;
        showSummaryModal(parseInt(articleId, 10));
      });
    });

  } catch (error) {
    console.error("記事の読み込みエラー:", error);
    articlesContainer.innerHTML = '<div class="status status--error">記事の読み込みに失敗しました。</div>';
  } finally {
    isLoadingMore = false;
    loadMoreBtn.textContent = 'さらに読み込む';
    loadMoreBtn.disabled = false;
    const spinner = articlesContainer.querySelector('.loading-spinner');
    if(spinner) spinner.remove();
  }
}

function showSummaryModal(articleId) {
    const article = articlesCache.find(a => a.id === articleId);
    if (!article) return;
    const modal = document.getElementById('summary-modal');
    
    document.getElementById('summary-title').textContent = article.title;
    
    const formattedDate = new Date(article.created_at).toLocaleDateString('ja-JP').replace(/\//g, '.');
    document.getElementById('summary-date').textContent = formattedDate;

    document.getElementById('summary-bullets').innerHTML = article.summary_points?.map(point => `<li>${point.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`).join('') || '';
    document.getElementById('summary-read-more').href = article.article_url;

    const cardImage = document.querySelector(`[data-article-id="${articleId}"] img`);
    document.getElementById('summary-image').style.backgroundImage = cardImage ? `url('${cardImage.src}')` : 'none';

    openModal(modal);
}

function promiseWithTimeout(promise, ms, timeoutError = new Error('Promise timed out')) {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(timeoutError);
    }, ms);
  });
  return Promise.race([promise, timeout]);
}
