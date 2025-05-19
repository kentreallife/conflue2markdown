document.addEventListener('DOMContentLoaded', function() {
    // 文字エンコーディングを明示的に指定
    const metaCharset = document.querySelector('meta[charset]');
    if (metaCharset) {
        metaCharset.setAttribute('charset', 'utf-8');
    }

    const convertBtn = document.getElementById('convertBtn');
    const copyBtn = document.getElementById('copyBtn');
    const outputArea = document.getElementById('output');
    const saveBtn = document.getElementById('saveBtn');
    const statusMessage = document.getElementById('statusMessage');

    // statusMessage要素が存在しない場合のフォールバック処理
    function setStatus(message, type) {
        if (statusMessage) {
            statusMessage.textContent = message;
            statusMessage.className = type;
        } else {
            console.warn("statusMessage element not found. Message:", message, "Type:", type);
        }
    }

    // outputArea要素が存在しない場合のフォールバック処理
    function setOutputValue(value) {
        if (outputArea) {
            outputArea.value = value;
        } else {
            console.warn("outputArea element not found. Value:", value);
        }
    }

    // ボタン要素が存在しない場合のエラーハンドリングを追加
    if (!convertBtn || !copyBtn || !saveBtn || !outputArea) {
        console.error("必要なUI要素の一部が見つかりません。popup.htmlを確認してください。");
        setStatus("UI要素の読み込みに失敗しました。", "status-error");
        return; // 必須要素がない場合は処理を中断
    }

    // ファイル名をサニタイズする関数
    function sanitizeFilename(name) {
        if (typeof name !== 'string') {
            name = 'confluence-export'; // デフォルト名
        }
        // ファイル名に使えない文字をアンダースコアに置換し、連続するアンダースコアを一つにまとめる
        let sanitized = name.replace(/[\\\/:*?"<>|]/g, '_').replace(/__+/g, '_');
        // 先頭と末尾のアンダースコアを削除
        sanitized = sanitized.replace(/^_+|_+$/g, '');
        // ファイル名が空になった場合はデフォルト名を使用
        return sanitized.length > 0 ? sanitized : 'confluence-export';
    }

    // 変換ボタンの処理
    convertBtn.addEventListener('click', () => {
        setOutputValue(''); // 出力エリアをクリア
        setStatus('変換中...', 'status-info');

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                setStatus('アクティブなタブが見つかりません。', 'status-error');
                return;
            }
            const activeTab = tabs[0];
            // content scriptが実行可能か確認 (URLベースでConfluenceページか判定する方が望ましい)
            if (!activeTab.url || (!activeTab.url.includes('atlassian.net/wiki') && !activeTab.url.includes('localhost'))) { // localhostはテスト用
                setStatus('Confluenceページで実行してください。', 'status-error');
                setOutputValue("この拡張機能はConfluenceのページでのみ動作します。");
                return;
            }

            chrome.scripting.executeScript(
                {
                    target: { tabId: activeTab.id },
                    files: ['content.js']
                },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error("content.jsの実行に失敗しました: ", chrome.runtime.lastError.message);
                        setStatus('変換スクリプトの読み込みに失敗しました。', 'status-error');
                        setOutputValue("エラー: " + chrome.runtime.lastError.message);
                        return;
                    }
                    // content.jsの実行後、メッセージを送信して変換を依頼
                    chrome.tabs.sendMessage(activeTab.id, { action: "convertToMarkdown" }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error("変換処理の呼び出しに失敗: ", chrome.runtime.lastError.message);
                            setStatus('変換処理の呼び出しに失敗しました。', 'status-error');
                            setOutputValue("エラー: " + chrome.runtime.lastError.message);
                            // responseがない場合やエラーの場合でも、タイトルだけでも取得できているか確認
                            if(response && response.title) {
                                 document.body.dataset.pageTitle = response.title;
                            } else {
                                document.body.dataset.pageTitle = 'confluence-export';
                            }
                            return;
                        }

                        if (response && typeof response.markdown === 'string') { // response.markdownの型もチェック
                            setOutputValue(response.markdown);
                            document.body.dataset.pageTitle = response.title || 'confluence-export'; // タイトルを保存
                            setStatus('変換完了！', 'status-success');
                            copyBtn.disabled = false;
                            saveBtn.disabled = false;
                        } else {
                            setStatus('変換に失敗しました。応答が正しくありません。', 'status-error');
                            setOutputValue("変換に失敗しました。コンテンツスクリプトからの応答が正しくありません。");
                            document.body.dataset.pageTitle = (response && response.title) ? response.title : 'confluence-export';
                        }
                    });
                }
            );
        });
    });

    // クリップボードにコピーボタンの処理
    copyBtn.addEventListener('click', () => {
        if (outputArea && outputArea.value) {
            const originalButtonText = copyBtn.textContent;
            navigator.clipboard.writeText(outputArea.value)
                .then(() => {
                    setStatus('Markdownをクリップボードにコピーしました。', 'status-success');
                    copyBtn.textContent = 'コピーしました！';
                    copyBtn.classList.add('success');
                    setTimeout(() => {
                        copyBtn.textContent = originalButtonText;
                        copyBtn.classList.remove('success');
                    }, 2500);
                })
                .catch(err => {
                    console.error('クリップボードへのコピーに失敗: ', err);
                    setStatus('コピーに失敗しました。', 'status-error');
                    copyBtn.textContent = 'コピー失敗';
                    copyBtn.classList.add('error');
                    setTimeout(() => {
                        copyBtn.textContent = originalButtonText;
                        copyBtn.classList.remove('error');
                    }, 2500);
                });
        } else {
            setStatus('コピーする内容がありません。', 'status-warning');
        }
    });

    // ファイルとして保存ボタンの処理
    saveBtn.addEventListener('click', () => {
      if (outputArea && outputArea.value) {
        try {
          const pageTitle = document.body.dataset.pageTitle || 'confluence-export';
          const filename = sanitizeFilename(pageTitle) + '.md';

          const blob = new Blob([outputArea.value], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename; // ここで動的なファイル名を使用
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setStatus(`「${filename}」として保存しました。`, 'status-success');
        } catch (error) {
            console.error('ファイルの保存中にエラーが発生しました: ', error);
            setStatus('ファイルの保存に失敗しました。', 'status-error');
        }
      } else {
        setStatus('保存する内容がありません。', 'status-warning');
      }
    });

    // 初期状態ではコピー・保存ボタンを無効化
    copyBtn.disabled = true;
    saveBtn.disabled = true;
}); 