// Background script for X Bookmark Exporter
chrome.runtime.onInstalled.addListener(() => {
    console.log('X Bookmark Exporter installed');
});

// メッセージハンドラー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadMarkdown') {
        // Markdownファイルのダウンロードを処理
        const blob = new Blob([request.content], {type: 'text/markdown;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: request.filename,
            saveAs: true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({success: false, error: chrome.runtime.lastError.message});
            } else {
                sendResponse({success: true, downloadId: downloadId});
            }
        });
        
        return true; // 非同期レスポンスを示す
    }
});

// アクションボタンクリック時の処理
chrome.action.onClicked.addListener((tab) => {
    // ポップアップが設定されているので、この処理は通常実行されない
    console.log('Extension icon clicked');
});

