console.log("Confluence to Markdown content script loaded.");

// Confluenceページのコンテンツを解析してMarkdownに変換する機能を提供
window.myConfluenceConverter = {
    mode: null, // 現在のConfluenceページのモード ('edit' または 'doc') を保持します。

    // メイン変換処理
    convert: function() {
        // 変換処理の開始をログに出力
        console.log("Markdown変換処理を開始します。");

        // 編集モードのコンテンツエリア要素を取得試行
        let contentArea = document.getElementById('ak-editor-textarea');
        if (contentArea) {
            // 編集モードの要素が見つかった場合
            this.mode = 'edit'; // モードを 'edit' に設定
            console.log("編集モードのコンテンツエリアが見つかりました: #ak-editor-textarea");
        } else {
            // 編集モードの要素が見つからない場合、ドキュメントモードのコンテンツエリア要素を取得試行
            console.log("編集モードのコンテンツエリア (#ak-editor-textarea) が見つかりませんでした。ドキュメントモードの要素を検索します。");
            contentArea = document.querySelector('.ak-renderer-document');
            if (contentArea) {
                // ドキュメントモードの要素が見つかった場合
                this.mode = 'doc'; // モードを 'doc' に設定
                console.log("ドキュメントモードのコンテンツエリアが見つかりました: .ak-renderer-document");
            } else {
                // どちらのモードのコンテンツエリアも見つからない場合
                this.mode = null; // モードを null に設定
                console.error("Confluenceのコンテンツエリアが見つかりませんでした。編集モードのID '#ak-editor-textarea' およびドキュメントモードのクラス '.ak-renderer-document' の両方を確認しました。");
                return "エラー: コンテンツエリアが見つかりませんでした。";
            }
        }

        // 現在の動作モードをログに出力
        console.log(`現在の処理モード: ${this.mode}`);

        let markdown = '';
        
        // コンテンツエリアの子要素を順番に処理（DOM順序を保持）
        const elements = contentArea.children;
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            // 見出しアンカーはスキップ
            if (element.tagName === 'SPAN' && element.getAttribute('data-testid') === 'visually-hidden-heading-anchor') {
                continue;
            }
            
            // チェックボックス関連要素を含む全要素を処理（順序を保持）
            markdown += this.convertElement(element) + '\n\n';
        }
        
        return markdown.trim();
    },
    
    // 要素の種類に応じた変換処理
    convertElement: function(element) {
        if (!element) return '';

        // 1. 親タスクリストコンテナを検出
        if (element.matches('div[data-task-list-local-id]')) {
            console.log('親タスクリストコンテナを検出:', element);
            let listMarkdown = '';
            // 直接の子要素である個々のチェックボックスコンテナを処理
            const taskItems = element.querySelectorAll(':scope > div[data-task-local-id]');
            console.log(`リスト内のタスク数: ${taskItems.length}`);
            taskItems.forEach(item => {
                const itemMarkdown = this.convertCheckbox(item);
                if (itemMarkdown) {
                    listMarkdown += itemMarkdown + '\n'; // 各チェックボックスを改行で区切る
                }
            });
            return listMarkdown.trim(); // 末尾の余分な改行を削除
        }

        // 2. 個別のチェックボックスコンテナ（親リストの一部である場合）はスキップ
        // （親リストコンテナの処理でカバーされるため）
        if (element.matches('div[data-task-local-id]') && 
            element.parentElement && 
            element.parentElement.matches('div[data-task-list-local-id]')) {
            console.log('スキップ: 親リスト内の個別チェックボックスコンテナ', element);
            return ''; 
        }

        // 3. チェックボックスのテキスト部分（data-component="content"）はスキップ
        if (element.matches('div[data-component="content"]') && 
            element.closest('div[data-task-local-id]')) { // 最も近い親にチェックボックスコンテナがあるか
            console.log('スキップ: チェックボックスのテキスト部分', element);
            return ''; // チェックボックス処理でテキストは取得済み
        }

        // 4. その他の要素タイプを処理
        const tagName = element.tagName.toLowerCase();
        
        switch (tagName) {
            case 'h1':
                return `# ${this.getTextContent(element)}`;
            case 'h2':
                return `## ${this.getTextContent(element)}`;
            case 'h3':
                return `### ${this.getTextContent(element)}`;
            case 'p':
                return this.processParagraphContent(element);
            case 'ul':
                return this.convertList(element, '- ');
            case 'ol':
                return this.convertList(element, null, true);
            case 'hr':
                return '---';
            case 'pre':
                // ここでは単純にpre要素のテキスト内容をブロックとして扱う。
                // 言語指定は別途検討が必要。
                return "```\n" + this.getTextContent(element) + "\n```";
            case 'blockquote':
                // blockquote要素内のテキストを取得し、各行の先頭に "> " を付与する
                const quoteText = this.getTextContent(element);
                const lines = quoteText.split('\n');
                return lines.map(line => `> ${line}`).join('\n');
            case 'img':
                const src = element.getAttribute('src') || '';
                const alt = element.getAttribute('alt') || '';
                return `![${alt}](${src})`;
            case 'div':
                if (element.classList.contains('pm-table-container')) {
                    return this.convertTable(element);
                } else if (element.classList.contains('ak-panel')) {
                    const panelType = element.dataset.panelType || 'info'; // デフォルトタイプをinfoに
                    // パネルのHTML構造を維持し、内部コンテンツを再帰的に変換
                    // 開始タグ。元のクラスとdata-panel-type属性を保持
                    let panelMarkdown = `<div class=\"ak-panel\" data-panel-type=\"${panelType}\">\n`;
                    // 子要素を変換して追加
                    panelMarkdown += this.processChildElements(element); 
                    panelMarkdown += "\n</div>";
                    return panelMarkdown;
                }
                // 特定のコンテナでない場合、子要素を処理
                return this.processChildElements(element);
            default:
                return this.processChildElements(element);
        }
    },
    
    // チェックボックス要素の変換
    convertCheckbox: function(containerElement) {
        console.log('チェックボックス変換開始:', containerElement);
        
        // コンテナ内からチェックボックスinput要素を検索
        const checkbox = containerElement.querySelector('input[type="checkbox"]');
        if (!checkbox) {
            console.log('チェックボックスinputが見つかりません');
            return ''; // チェックボックスが見つからない場合は空文字
        }
        
        const isChecked = checkbox.checked;
        console.log('チェック状態:', isChecked);
        
        let contentText = "";
        
        // コンテナ内からテキスト要素（data-component="content"を持つdiv）を検索
        const textElement = containerElement.querySelector('div[data-component="content"]');
        if (textElement) {
            contentText = this.getTextContent(textElement);
            console.log('テキスト要素が見つかりました:', contentText);
        } else {
            console.log('テキスト要素が見つかりません。代替テキストを探します。');
            // フォールバック：テキストdivが見つからない場合、コンテナ全体のテキストを使う
            // ただし、不要な内部テキスト（アイコンなど）を除く処理が必要になる可能性
            contentText = this.getTextContent(containerElement);
        }
        
        const markdown = `${isChecked ? '[x]' : '[ ]'} ${contentText}`;
        console.log('変換されたチェックボックスMarkdown:', markdown);
        return markdown;
    },
    
    // テキストコンテンツを安全に取得する
    getTextContent: function(element) {
        return element.textContent.trim();
    },
    
    // パラグラフ内のリッチテキスト処理
    processParagraphContent: function(element) {
        let text = '';
        
        // チェックボックス（タスクリスト）の処理
        if (element.querySelector('input[type="checkbox"]')) {
            const isChecked = element.querySelector('input[type="checkbox"]').checked;
            // テキスト内容を抽出（チェックボックスアイコンを除く）
            let contentText = this.getTextContent(element).replace(/□|☑/g, '').trim();
            return `${isChecked ? '[x]' : '[ ]'} ${contentText}`;
        }
        
        // 子要素を走査して、太字、イタリック、色付きテキストなどを処理
        if (element.childNodes.length === 0) {
            return this.getTextContent(element);
        }
        
        element.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const childTag = node.tagName.toLowerCase();
                
                if (childTag === 'strong' || childTag === 'b') {
                    // 太字
                    text += `**${this.getTextContent(node)}**`;
                } else if (childTag === 'em' || childTag === 'i') {
                    // イタリック
                    text += `*${this.getTextContent(node)}*`;
                } else if (childTag === 'span' && node.classList.contains('fabric-text-color-mark')) {
                    // 色付きテキスト - Markdownで色を表現するには HTML タグを使用
                    const colorStyle = node.getAttribute('style') || '';
                    const colorMatch = colorStyle.match(/color:\s*([^;]+)/i);
                    if (colorMatch && colorMatch[1]) {
                        text += `<span style="color: ${colorMatch[1]};">${this.getTextContent(node)}</span>`;
                    } else {
                        text += this.getTextContent(node);
                    }
                } else if (childTag === 'a') {
                    // リンク
                    const href = node.getAttribute('href') || '#';
                    text += `[${this.getTextContent(node)}](${href})`;
                } else if (childTag === 'input' && node.type === 'checkbox') {
                    // チェックボックス
                    text += node.checked ? '[x] ' : '[ ] ';
                } else if (childTag === 'code') {
                    // インラインコード
                    // code タグが pre タグの直接の子である場合は、コードブロックとして処理済みのはずなので、
                    // ここでは pre の中にない code タグをインラインコードとして扱う。
                    if (node.closest('pre')) { // 親にpreがある場合は何もしない
                        text += this.getTextContent(node); // コードブロック側で処理される想定
                    } else {
                        text += `\`${this.getTextContent(node)}\``;
                    }
                } else {
                    text += this.processParagraphContent(node);
                }
            }
        });
        
        return text;
    },
    
    // リスト要素の変換
    convertList: function(listElement, prefix = '- ', isOrdered = false, useBr = false) {
        let result = '';
        const items = listElement.querySelectorAll(':scope > li');
        const lineSeparator = useBr ? '<br>' : '\n'; // 改行文字を選択
        
        items.forEach((item, index) => {
            // data-indent-level 属性からインデントレベルを取得（1から始まる想定）
            // 属性がない場合はデフォルトでレベル1とする
            const indentLevel = parseInt(item.dataset.indentLevel, 10) || 1;
            // インデントレベルに基づいてスペースを生成 (レベル1はスペースなし、レベル2はスペース2つ...)
            const indentSpaces = '  '.repeat(Math.max(0, indentLevel - 1));

            let currentItemPrefix;
            if (isOrdered) {
                // 番号付きリストの場合のプレフィックス
                currentItemPrefix = `${indentSpaces}${index + 1}. `;
            } else {
                // 箇条書きリストの場合のプレフィックス
                // prefix 引数は基本マーカー ('- ' を想定)
                currentItemPrefix = `${indentSpaces}${prefix}`;
            }

            // li要素の直接の子要素を処理する
            let itemContentParts = [];
            item.childNodes.forEach(childNode => {
                if (childNode.nodeType === Node.ELEMENT_NODE) {
                    if (childNode.tagName.toLowerCase() === 'p') {
                        itemContentParts.push(this.processParagraphContent(childNode));
                    } else if (childNode.tagName.toLowerCase() === 'ul') {
                        // ネストされた箇条書きリスト
                        // prefixには基本マーカー '- ' を渡し、インデントはdata-indent-levelに任せる
                        itemContentParts.push(
                            this.convertList(childNode, '- ', false, useBr)
                        );
                    } else if (childNode.tagName.toLowerCase() === 'ol') {
                        // ネストされた番号付きリスト
                        // prefixにはnull（または未使用のマーカー）を渡し、インデントはdata-indent-levelに任せる
                        itemContentParts.push(
                            this.convertList(childNode, null, true, useBr)
                        );
                    } else {
                        // その他の要素はテキストとして取得
                        const text = this.getTextContent(childNode);
                        if (text) itemContentParts.push(text);
                    }
                } else if (childNode.nodeType === Node.TEXT_NODE && childNode.textContent.trim()) {
                    itemContentParts.push(childNode.textContent.trim());
                }
            });
            
            // パーツを結合
            const text = itemContentParts.join(' '); // パーツ間はスペースで結合
            
            result += `${currentItemPrefix}${text}${lineSeparator}`; // 選択された改行文字を使用
        });
        
        // 末尾の不要な改行を削除
        return result.trim().replace(new RegExp(lineSeparator + '$'), '');
    },
    
    // テーブルの変換
    convertTable: function(tableContainer) {
        console.log('テーブル変換開始', tableContainer);
        
        // Confluenceでは複数のテーブル要素が入れ子になっていることがある
        // これには「固定ヘッダー用」と「データ用」のテーブルが分かれていることがある
        
        // 最初にすべてのtableを探す
        const allTables = tableContainer.querySelectorAll('table');
        console.log('見つかったテーブル数:', allTables.length);
        
        if (allTables.length === 0) {
            console.error('テーブル要素が見つかりません');
            return '';
        }
        
        // Confluenceのテーブル構造：通常は固定ヘッダー用とデータ用に分かれている
        // 適切なテーブルを特定（通常は最も行数の多いテーブルがメインテーブル）
        let mainTable = null;
        let maxRows = 0;
        
        allTables.forEach(table => {
            const rowCount = table.querySelectorAll('tr').length;
            console.log('テーブルの行数:', rowCount);
            if (rowCount > maxRows) {
                maxRows = rowCount;
                mainTable = table;
            }
        });
        
        // メインテーブルが見つからない場合は最初のテーブルを使用
        if (!mainTable && allTables.length > 0) {
            mainTable = allTables[0];
        }
        
        if (!mainTable) {
            return '';
        }
        
        // テーブルの行を収集
        const rows = mainTable.querySelectorAll('tr');
        console.log('最終的なテーブルの行数:', rows.length);
        
        if (rows.length === 0) {
            return '';
        }
        
        // MarkdownテーブルデータのためのCSV風の2次元配列を作成
        const tableData = [];
        
        // 各行を処理
        rows.forEach((row, rowIndex) => {
            console.log(`行 ${rowIndex} の処理中...`);
            const rowData = [];
            
            // その行のすべてのセル（thとtd）を取得
            const cells = row.querySelectorAll('th, td');
            console.log(`行 ${rowIndex} のセル数:`, cells.length);
            
            // 各セルを処理
            cells.forEach((cell, cellIndex) => {
                
                // セルの直接の子要素を処理
                const cellChildren = cell.childNodes;
                const contentParts = []; // 変換されたパーツを格納する配列
                
                cellChildren.forEach(childNode => {
                    let part = ''; // 各子ノードから変換された部分
                    if (childNode.nodeType === Node.ELEMENT_NODE) {
                        const tagName = childNode.tagName.toLowerCase();
                        // 子要素がELEMENT_NODEの場合、適切な変換関数を呼び出す
                        if (tagName === 'p') {
                            part = this.processParagraphContent(childNode);
                        } else if (tagName === 'ul') {
                            // テーブルセル内では<br>で改行
                            part = this.convertList(childNode, '- ', false, true);
                        } else if (tagName === 'ol') {
                            // テーブルセル内では<br>で改行
                            part = this.convertList(childNode, null, true, true);
                        } else if (tagName === 'strong' || tagName === 'b') {
                            part = `**${this.getTextContent(childNode)}**`;
                        } else if (!childNode.matches('figure.ak-renderer-tableHeader-sorting-icon__wrapper')) {
                            const childText = this.getTextContent(childNode);
                            if (childText) {
                                part = childText;
                            }
                        }
                    } else if (childNode.nodeType === Node.TEXT_NODE && childNode.textContent.trim()) {
                        part = childNode.textContent.trim();
                    }
                    
                    // 空でない変換結果のみを追加
                    if (part) {
                        contentParts.push(part);
                    }
                });

                // 収集したパーツを<br>で結合
                let cellContent = contentParts.join('<br>').trim();

                // 不要な末尾の<br>を削除
                cellContent = cellContent.replace(/^(<br>)+|(<br>)+$/g, '');

                console.log(`セル [${rowIndex}][${cellIndex}] の内容:`, cellContent);
                rowData.push(cellContent);
            });
            
            // 行データを追加（空でない場合）
            if (rowData.length > 0) {
                tableData.push(rowData);
            }
        });
        
        // テーブルデータが空なら空文字を返す
        if (tableData.length === 0) {
            console.error('テーブルにデータがありません');
            return '';
        }
        
        console.log('収集されたテーブルデータ:', tableData);
        
        // 各列の最大幅を計算（区切り線のため - <br>は幅計算に含めない）
        const columnCount = Math.max(...tableData.map(row => row.length));
        const columnWidths = Array(columnCount).fill(0);
        
        tableData.forEach(row => {
            // セル数を揃える
            while (row.length < columnCount) {
                row.push('');
            }
            // 幅を計算
            row.forEach((cell, colIndex) => {
                // <br>を除去したテキストで幅を計算
                const textWidth = cell.replace(/<br>/g, '').length;
                columnWidths[colIndex] = Math.max(columnWidths[colIndex], textWidth);
            });
        });
        
        console.log('列の最大幅:', columnWidths);
        
        // Markdownテーブルを生成
        let markdown = '';
        
        // ヘッダー行（最初の行）
        markdown += '| ' + tableData[0].join(' | ') + ' |\n';
        
        // 区切り行（最小長3、計算した幅に合わせる）
        markdown += '| ' + columnWidths.map(width => '-'.repeat(Math.max(3, width))).join(' | ') + ' |\n';
        
        // データ行（2行目以降）
        for (let i = 1; i < tableData.length; i++) {
            markdown += '| ' + tableData[i].join(' | ') + ' |\n';
        }
        
        console.log('変換されたMarkdownテーブル:', markdown);
        return markdown;
    },
    
    // 子要素を再帰的に処理
    processChildElements: function(element) {
        let content = '';
        element.childNodes.forEach(child => {
            let childMarkdown = '';
            if (child.nodeType === Node.ELEMENT_NODE) {
                // ELEMENT_NODEの場合、convertElementを再帰的に呼び出す
                // ここでもthis.modeが引き継がれるため、ネストされた要素もモードに応じた処理が可能
                childMarkdown = this.convertElement(child);
            } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                // TEXT_NODEの場合、トリムしたテキストコンテンツを使用
                childMarkdown = child.textContent.trim();
            }
            
            if (childMarkdown) {
                // 変換後のMarkdownが空でない場合のみ結果に追加
                // contentが既に何かを含んでいれば改行で区切り、そうでなければそのまま追加
                content += (content ? '\n\n' : '') + childMarkdown;
            }
        });
        return content;
    }
};

// 必要に応じて、DOMの変更を監視したり、初期化処理を行う 