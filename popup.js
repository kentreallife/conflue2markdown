const convertBtn = document.getElementById('convertBtn');
const copyBtn = document.getElementById('copyBtn');
const outputArea = document.getElementById('output');
const saveBtn = document.getElementById('saveBtn');

// エンコーディング問題を解決するための文字化け防止対策
document.addEventListener('DOMContentLoaded', function() {
  // 文字エンコーディングを明示的に指定
  document.querySelector('meta[charset]').setAttribute('charset', 'utf-8');
});

convertBtn.addEventListener('click', async () => {
  outputArea.value = '変換中...';
  copyBtn.disabled = true;
  saveBtn.disabled = true;

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // まず content.js を注入する（すでに注入されている場合は無視される）
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    // content.js が注入された後、変換機能を実行
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: convertPageToMarkdown,
    }, (injectionResults) => {
      handleConversionResult(injectionResults);
    });
  } catch (err) {
    console.error('スクリプト注入エラー:', err);
    outputArea.value = 'エラー: スクリプトの注入に失敗しました。\n' + err.message;
    copyBtn.disabled = true;
    saveBtn.disabled = true;
  }
});

// 変換結果を処理する関数
function handleConversionResult(injectionResults) {
  if (chrome.runtime.lastError || !injectionResults || !injectionResults[0]) {
    outputArea.value = 'エラー: ページの変換に失敗しました。\n' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : '不明なエラーが発生しました。');
    copyBtn.disabled = true;
    saveBtn.disabled = true;
    return;
  }
  
  const markdown = injectionResults[0].result;
  if (markdown) {
    // 文字化け防止のために一度デコードしてからエンコードしなおす
    try {
      // 直接テキストを設定
      outputArea.value = markdown;
      copyBtn.disabled = false;
      saveBtn.disabled = false;
    } catch (err) {
      console.error('テキスト設定エラー:', err);
      outputArea.value = 'エラー: テキスト設定に失敗しました。';
      copyBtn.disabled = true;
      saveBtn.disabled = true;
    }
  } else {
    outputArea.value = '変換可能なコンテンツが見つかりませんでした。';
    copyBtn.disabled = true;
    saveBtn.disabled = true;
  }
}

copyBtn.addEventListener('click', () => {
  if (outputArea.value) {
    // 方法1: クリップボードへのコピー（document.execCommand）
    try {
      // テキストエリアを選択
      outputArea.select();
      // コピーコマンドを実行
      const success = document.execCommand('copy');
      
      if (success) {
        copyBtn.textContent = 'コピーしました！';
        setTimeout(() => { copyBtn.textContent = 'クリップボードにコピー'; }, 1000);
        return;
      }
    } catch (err) {
      console.error('execCommandコピーエラー:', err);
    }
    
    // 方法2: Blobを使用した方法
    try {
      const blob = new Blob([outputArea.value], { type: 'text/plain;charset=utf-8' });
      
      // IE11対応（ClipboardAPIが使えない場合）
      if (navigator.msSaveBlob) {
        navigator.msSaveBlob(blob, 'confluence-export.md');
        copyBtn.textContent = 'コピーしました！';
        setTimeout(() => { copyBtn.textContent = 'クリップボードにコピー'; }, 1000);
        return;
      }
      
      // 現代的なブラウザ対応
      const data = [new ClipboardItem({ [blob.type]: blob })];
      navigator.clipboard.write(data).then(() => {
        copyBtn.textContent = 'コピーしました！';
        setTimeout(() => { copyBtn.textContent = 'クリップボードにコピー'; }, 1000);
      }).catch(err => {
        console.error('Blob経由のコピーエラー:', err);
        
        // 方法3: 最終手段としてのClipboard APIテキスト
        navigator.clipboard.writeText(outputArea.value).then(() => {
          copyBtn.textContent = 'コピーしました！';
          setTimeout(() => { copyBtn.textContent = 'クリップボードにコピー'; }, 1000);
        }).catch(finalErr => {
          console.error('最終手段コピーエラー:', finalErr);
          outputArea.value += '\n\nコピーに失敗しました。テキストを手動で選択しコピーしてください。';
        });
      });
    } catch (err) {
      console.error('高度なコピー方法エラー:', err);
      // 最終フォールバック
      try {
        navigator.clipboard.writeText(outputArea.value).then(() => {
          copyBtn.textContent = 'コピーしました！';
          setTimeout(() => { copyBtn.textContent = 'クリップボードにコピー'; }, 1000);
        }).catch(err => {
          outputArea.value += '\n\nコピーに失敗しました。テキストを手動で選択しコピーしてください。';
        });
      } catch (finalErr) {
        outputArea.value += '\n\nコピーに失敗しました。テキストを手動で選択しコピーしてください。';
      }
    }
  }
});

// ファイルとして保存ボタンの処理
saveBtn.addEventListener('click', () => {
  if (outputArea.value) {
    try {
      const blob = new Blob([outputArea.value], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'confluence-export.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      saveBtn.textContent = '保存しました！';
      setTimeout(() => { saveBtn.textContent = 'ファイルとして保存'; }, 1500);
    } catch (err) {
      console.error('ファイル保存エラー:', err);
      const originalText = saveBtn.textContent;
      saveBtn.textContent = '保存失敗';
      setTimeout(() => { saveBtn.textContent = originalText; }, 2000);
    }
  }
});

// この関数は content.js 側で実行される
function convertPageToMarkdown() {
    // content.js で実装されたConverterオブジェクトを確認
    console.log('変換を開始します...');
    console.log('myConfluenceConverter存在チェック:', !!window.myConfluenceConverter);
    
    // content.js で実装されたConverterオブジェクトを使用
    if (window.myConfluenceConverter && typeof window.myConfluenceConverter.convert === 'function') {
        try {
            console.log('Converterを実行します');
            const result = window.myConfluenceConverter.convert();
            console.log('変換結果:', result.substring(0, 50) + '...');
            return result;
        } catch (err) {
            console.error('Converter実行エラー:', err);
            return "エラー: 変換処理の実行中に問題が発生しました。" + err.message;
        }
    } else {
        console.error('myConfluenceConverterが見つかりません');
    }
    
    // フォールバック：Converterが見つからない場合は簡易的な変換を実行
    console.log('フォールバック処理を実行します');
    const contentArea = document.querySelector('.ak-renderer-document');
    if (!contentArea) {
        console.error("Could not find Confluence content area (.ak-renderer-document)");
        return "エラー: コンテンツエリアが見つかりませんでした。";
    }

    // 簡単なテストとして、見出し1を取得してみる
    const h1 = contentArea.querySelector('h1');
    let md = '';
    if(h1) {
        md += `# ${h1.innerText}\n\n`;
    } else {
        md += "見出しが見つかりませんでした。\n";
    }
    
    md += "注意: 完全な変換処理が利用できませんでした。content.jsが正しく読み込まれているか確認してください。";

    return md;
} 