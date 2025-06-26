// Content script for X Bookmark Exporter
console.log('X Bookmark Exporter content script loaded');

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
        console.log('Ping received');
        sendResponse({status: 'ok'});
        return;
    }

    if (request.action === 'exportBookmarks') {
        console.log('Export bookmarks request received');
        
        // 現在のページがブックマークページかチェック
        if (!window.location.href.includes('/i/bookmarks')) {
            sendResponse({
                success: false,
                error: 'This is not a bookmark page. Please open https://x.com/i/bookmarks.'
            });
            return;
        }
        
        // ブックマークデータを取得
        extractBookmarks()
            .then(bookmarks => {
                console.log(`Found ${bookmarks.length} bookmarks`);
                sendResponse({
                    success: true,
                    data: bookmarks
                });
            })
            .catch(error => {
                console.error('Error extracting bookmarks:', error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        
        return true; // 非同期レスポンスを示す
    }
});

async function extractBookmarks() {
    const bookmarks = new Map(); // 重複を避けるためにMapを使用
    let scrollAttempts = 0;
    const maxScrollAttempts = 1000; // 最大スクロール回数を増やす
    let stableCount = 0;

    console.log('Starting bookmark extraction...');

    // ページが完全に読み込まれるまで待機
    await waitForPageLoad();

    while (scrollAttempts < maxScrollAttempts) {
        // 現在表示されているブックマークを取得
        const currentBookmarks = extractVisibleBookmarks();

        // 新しいブックマークを追加
        currentBookmarks.forEach(bookmark => {
            if (bookmark.url && !bookmarks.has(bookmark.url)) {
                bookmarks.set(bookmark.url, bookmark);
            }
        });

        console.log(`Scroll attempt ${scrollAttempts + 1}: Found ${bookmarks.size} total bookmarks`);

        const previousBookmarkCount = bookmarks.size;
        const previousHeight = document.body.scrollHeight;

        // ページの最下部までスクロール
        window.scrollTo(0, document.body.scrollHeight);

        // 新しいコンテンツの読み込みを待機
        await sleep(3000); // 待機時間を延長

        const newHeight = document.body.scrollHeight;

        // 新しいコンテンツが読み込まれたかチェック
        if (bookmarks.size === previousBookmarkCount && newHeight === previousHeight) {
            stableCount++;
            if (stableCount >= 10) { // 安定と見なす回数を増やす
                console.log('No new bookmarks found and page height did not change after 10 attempts, stopping...');
                break;
            }
        } else {
            stableCount = 0;
        }

        scrollAttempts++;
    }

    console.log(`Extraction completed. Total bookmarks: ${bookmarks.size}`);
    return Array.from(bookmarks.values());
}

function extractVisibleBookmarks() {
    const visibleBookmarks = [];
    const tweetSelector = 'article[data-testid="tweet"]';
    const tweets = document.querySelectorAll(tweetSelector);

    if (tweets.length === 0) {
        console.log('No tweets found with selector:', tweetSelector);
        return visibleBookmarks;
    }

    tweets.forEach((tweet, index) => {
        try {
            const bookmark = extractTweetData(tweet);
            if (bookmark && bookmark.url) {
                visibleBookmarks.push(bookmark);
            }
        } catch (error) {
            console.error(`Error extracting tweet ${index}:`, error);
        }
    });

    return visibleBookmarks;
}

function extractTweetData(tweetElement) {
    const bookmark = {
        text: '',
        author: '',
        username: '',
        date: '',
        url: '',
        images: [],
        links: []
    };
    
    try {
        // ツイートテキストを取得
        const textElements = tweetElement.querySelectorAll('[data-testid="tweetText"]');
        if (textElements.length > 0) {
            bookmark.text = textElements[0].textContent.trim();
        }
        
        // 作者情報を取得
        const authorElements = tweetElement.querySelectorAll('[data-testid="User-Name"]');
        if (authorElements.length > 0) {
            const authorElement = authorElements[0];
            const nameElement = authorElement.querySelector('span');
            if (nameElement) {
                bookmark.author = nameElement.textContent.trim();
            }
            
            // ユーザー名を取得
            const usernameElement = authorElement.querySelector('a[href*="/"]');
            if (usernameElement) {
                const href = usernameElement.getAttribute('href');
                bookmark.username = href.replace('/', '');
            }
        }
        
        // 日時を取得
        const timeElements = tweetElement.querySelectorAll('time');
        if (timeElements.length > 0) {
            bookmark.date = timeElements[0].getAttribute('datetime') || timeElements[0].textContent;
        }
        
        // ツイートURLを取得
        const linkElements = tweetElement.querySelectorAll('a[href*="/status/"]');
        if (linkElements.length > 0) {
            const href = linkElements[0].getAttribute('href');
            bookmark.url = href.startsWith('http') ? href : `https://x.com${href}`;
        }
        
        // 画像を取得
        const imageElements = tweetElement.querySelectorAll('img[src*="pbs.twimg.com"]');
        imageElements.forEach(img => {
            // アイコン画像を除外する（親要素にdata-testid="Tweet-User-Avatar"がないことを確認）
            if (!img.closest('[data-testid="Tweet-User-Avatar"]')) {
                const src = img.getAttribute('src');
                if (src && !bookmark.images.includes(src)) {
                    bookmark.images.push(src);
                }
            }
        });
        
        // リンクを取得
        const cardLinks = tweetElement.querySelectorAll('a[href*="t.co"]');
        cardLinks.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent.trim();
            if (href && text) {
                bookmark.links.push({url: href, text: text});
            }
        });
        
        // 最低限の情報があるかチェック
        if (bookmark.text || bookmark.url) {
            return bookmark;
        }
        
    } catch (error) {
        console.error('Error extracting tweet data:', error);
    }
    
    return null;
}

function waitForPageLoad() {
    return new Promise((resolve) => {
        if (document.readyState === 'complete') {
            setTimeout(resolve, 1000); // 追加の待機時間
        } else {
            window.addEventListener('load', () => {
                setTimeout(resolve, 1000);
            });
        }
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ページ読み込み完了時の初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

function initialize() {
    console.log('X Bookmark Exporter initialized on:', window.location.href);
}

