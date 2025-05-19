console.log("Confluence to Markdown content script loaded.");

// Confluenceページのコンテンツを解析してMarkdownに変換する機能を提供
window.myConfluenceConverter = {
    mode: null, // 現在のConfluenceページのモード ('edit' または 'doc') を保持します。

    // ページタイトルを取得する関数
    getPageTitle: function() {
        let title = 'confluence-export'; // デフォルトのタイトル
        try {
            if (this.mode === 'edit') {
                // 編集モードのタイトル
                const titleElement = document.querySelector('textarea[data-test-id="editor-title"]');
                if (titleElement) {
                    title = titleElement.value.trim();
                    console.log("編集モードのタイトルを取得:", title);
                }
            } else if (this.mode === 'doc') {
                // ドキュメントモードのタイトル
                // sample_doc_mode.html L13 の span._19pk17rr を元にセレクタを決定
                // より堅牢なセレクタがあれば変更を検討
                const titleElement = document.querySelector('span[class^="_19pk17rr"]'); // クラス名が前方一致するものを探す
                if (titleElement && titleElement.textContent) {
                    title = titleElement.textContent.trim();
                    console.log("ドキュメントモードのタイトルを取得:", title);
                } else {
                    // フォールバックとして document.title を試す (より一般的な場合)
                    const h1Title = document.querySelector('h1');
                    if (h1Title && h1Title.textContent) {
                        title = h1Title.textContent.trim();
                         console.log("ドキュメントモードのフォールバックタイトル(h1)を取得:", title);
                    } else {
                        title = document.title.split(' - ')[0].trim(); // ブラウザのタブタイトルから取得
                        console.log("ドキュメントモードのフォールバックタイトル(document.title)を取得:", title);
                    }
                }
            }
        } catch (e) {
            console.error("ページタイトルの取得中にエラーが発生しました:", e);
        }
        // ファイル名として不適切な文字を置換 (簡易的なサニタイズ)
        return title.replace(/[\\/:*?"<>|]/g, '_');
    },

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
                // タイトルだけでも返せるように試みる
                const pageTitle = this.getPageTitle();
                return { title: pageTitle, markdown: "エラー: コンテンツエリアが見つかりませんでした。" };
            }
        }

        // 現在の動作モードをログに出力
        console.log(`現在の処理モード: ${this.mode}`);
        const pageTitle = this.getPageTitle(); // タイトルを取得

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
                return this.convertList(element, '-', false);
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
    convertList: function(listElement, prefixChar, isOrdered, useBrAsSeparator = false) {
        let finalMarkdownOutput = '';
        const listItems = listElement.querySelectorAll(':scope > li');
        const lineSeparator = useBrAsSeparator ? '<br>' : '\n';

        // リスト全体のインデントレベルを取得 (ul/ol要素のdata-indent-levelを参照)
        const listIndentLevel = parseInt(listElement.dataset.indentLevel, 10) || 1;
        // インデントレベルに基づいてスペースを生成 (レベル1はスペースなし、レベル2はスペース2つ...)
        // Markdownの標準的なインデントは2スペースまたは4スペース。ここでは2スペースを採用。
        const baseIndent = '  '.repeat(Math.max(0, listIndentLevel - 1));

        listItems.forEach((listItem) => {
            // 各リストアイテムのマーカーとインデントを含めたプレフィックスを生成
            const marker = isOrdered ? `${finalMarkdownOutput.split(lineSeparator).length - (finalMarkdownOutput.endsWith(lineSeparator) ? 1:0) + (listIndentLevel > 1 && isOrdered ? 0 : 1) }.` : prefixChar;
            
            // 番号付きリストの開始番号をリセットする処理を追加
            // Confluenceのol要素にはstart属性がないため、ネストレベルとCSSカウンターに頼る必要がある場合があるが、
            // ここでは単純に itemIndex を使う (0-indexedなので +1 する)
            // ただし、上記のmarker生成ロジックで複雑になっているため、シンプルな itemIndex + 1 に戻すか検討。
            // 現状は、複雑なmarker生成でネスト時の番号リセットを試みているが、ConfluenceのHTML構造と期待するMD出力に依存する。
            // plugin_requirment.md の期待出力は、ネストされても 1. から始まる。
            let actualMarker;
            if (isOrdered) {
                // ネストされたOLの場合、インデックスは0から始まるようにする。
                // 簡単な方法として、同じindent-levelのOLが連続する場合のカウンターを別途持つ必要があるが、
                // ここでは単純に itemIndex を使用する。
                // ConfluenceのHTMLでは start 属性がないため、見た目上の番号とDOM構造上のインデックスで対応。
                // `listItems.length` の代わりに、現在の `listItem` のインデックスを取得。
                const itemIndex = Array.from(listItems).indexOf(listItem);
                actualMarker = `${itemIndex + 1}.`;
            } else {
                actualMarker = prefixChar;
            }
            const itemPrefixWithIndent = `${baseIndent}${actualMarker} `;

            let itemContentText = '';
            let nestedListsMarkdown = '';

            // li要素の直接の子要素を処理
            listItem.childNodes.forEach(childNode => {
                if (childNode.nodeType === Node.ELEMENT_NODE) {
                    const tagName = childNode.tagName.toLowerCase();
                    if (tagName === 'p') {
                        if (!itemContentText) {
                            itemContentText = this.processParagraphContent(childNode);
                        } else {
                            // 複数のpタグがli直下にある場合（稀だが）、改行で連結
                            itemContentText += lineSeparator + this.processParagraphContent(childNode);
                        }
                    } else if (tagName === 'ul') {
                        // ネストされた箇条書きリスト
                        nestedListsMarkdown += lineSeparator + this.convertList(childNode, '-', false, useBrAsSeparator);
                    } else if (tagName === 'ol') {
                        // ネストされた番号付きリスト
                        nestedListsMarkdown += lineSeparator + this.convertList(childNode, null, true, useBrAsSeparator);
                    } else if (!itemContentText && childNode.textContent && childNode.textContent.trim() !== '') {
                        // pタグ以外で、テキストコンテンツを持つ最初の要素をitemContentTextとする（フォールバック）
                        // processParagraphContent を通すことでインライン要素も処理
                        itemContentText = this.processParagraphContent(childNode);
                    }
                } else if (childNode.nodeType === Node.TEXT_NODE && childNode.textContent && childNode.textContent.trim() !== '' && !itemContentText) {
                    // li 直下のテキストノード（稀）
                    itemContentText = childNode.textContent.trim();
                }
            });
            
            // itemContentText が取得できなかった場合の最終フォールバック
            // (li直下にpもテキストもなく、いきなりul/olが来ることは通常ないはず)
            if (!itemContentText && listItem.textContent && listItem.textContent.trim() && !nestedListsMarkdown) {
                 // listItem全体のテキストからネストされたリストのテキストを除いたものをコンテンツとするのは複雑なので、
                 // 基本的にはli > p or li > (inline elements) の構造を期待する。
                 // どうしても取得できない場合は listItem.firstChild の内容を processParagraphContent に通すなど。
                 // ただし、現状のロジックで主要なケースはカバーできるはず。
            }

            let currentItemMarkdown = `${itemPrefixWithIndent}${itemContentText}`;
            if (nestedListsMarkdown) {
                currentItemMarkdown += nestedListsMarkdown; // nestedListsMarkdown は既に先頭に lineSeparator を含んでいる
            }
            finalMarkdownOutput += currentItemMarkdown + lineSeparator;
        });
        
        // 末尾の不要な改行を削除
        if (finalMarkdownOutput.endsWith(lineSeparator)) {
            finalMarkdownOutput = finalMarkdownOutput.substring(0, finalMarkdownOutput.length - lineSeparator.length);
        }
        return finalMarkdownOutput;
    },
    
    // テーブルの変換
    convertTable: function(tableContainer) {
        console.log('テーブル変換開始', tableContainer);
        const allTables = tableContainer.querySelectorAll('table');
        if (allTables.length === 0) {
            console.error('テーブル要素が見つかりません');
            return '';
        }

        let mainTable = null;
        let maxRowsCount = 0;
        allTables.forEach(table => {
            const rowCount = table.querySelectorAll('tr').length;
            if (rowCount > maxRowsCount) {
                maxRowsCount = rowCount;
                mainTable = table;
            }
        });
        if (!mainTable && allTables.length > 0) mainTable = allTables[0];
        if (!mainTable) return '';

        const htmlRows = mainTable.querySelectorAll('tr');
        if (htmlRows.length === 0) return '';

        // Determine grid dimensions
        let numGridRows = 0;
        let numGridCols = 0;
        htmlRows.forEach((row, rIdx) => {
            numGridRows++;
            let currentCols = 0;
            row.querySelectorAll('th, td').forEach(cell => {
                const colspan = parseInt(cell.getAttribute('colspan') || '1');
                currentCols += colspan;
            });
            if (currentCols > numGridCols) {
                numGridCols = currentCols;
            }
        });
        
        // Initialize Markdown grid with nulls (or a unique placeholder)
        const markdownGrid = Array.from({ length: numGridRows }, () => Array(numGridCols).fill(null));

        htmlRows.forEach((htmlRow, rIdx) => {
            const htmlCells = htmlRow.querySelectorAll('th, td');
            let currentGridCol = 0;
            htmlCells.forEach(cell => {
                // Find the next available cell in the markdownGrid for the current row
                while (markdownGrid[rIdx][currentGridCol] !== null) {
                    currentGridCol++;
                    if (currentGridCol >= numGridCols) { // Should not happen if numGridCols is correct
                        console.error("Error: Ran out of columns in markdownGrid");
                        break;
                    }
                }
                if (currentGridCol >= numGridCols) return;


                const colspan = parseInt(cell.getAttribute('colspan') || '1');
                const rowspan = parseInt(cell.getAttribute('rowspan') || '1');

                // Extract cell content ( reusing existing logic)
                const cellChildren = cell.childNodes;
                const contentParts = [];
                cellChildren.forEach(childNode => {
                    let part = '';
                    if (childNode.nodeType === Node.ELEMENT_NODE) {
                        const tagName = childNode.tagName.toLowerCase();
                        if (tagName === 'p') {
                            part = this.processParagraphContent(childNode);
                        } else if (tagName === 'ul') {
                            part = this.convertList(childNode, '-', false, true);
                        } else if (tagName === 'ol') {
                            part = this.convertList(childNode, null, true, true);
                        } else if (tagName === 'strong' || tagName === 'b') {
                            part = `**${this.getTextContent(childNode)}**`;
                        } else if (!childNode.matches('figure.ak-renderer-tableHeader-sorting-icon__wrapper') && !childNode.matches('div.ak-renderer-tableHeader-sortable-column') && !childNode.querySelector('div.ak-renderer-tableHeader-sortable-column')) {
                            // The new conditions above are to avoid grabbing the whole sortable column div again if p is already processed.
                            // Or if the cell content is directly in the th/td without a p (doc mode often has div wrapper)
                            let tempContent = '';
                            if (childNode.querySelector('p')) { // Prefer p if exists
                                tempContent = this.processParagraphContent(childNode.querySelector('p'));
                            } else {
                                tempContent = this.getTextContent(childNode);
                            }
                             if (tempContent) part = tempContent;
                        }
                         // Special handling for "doc mode" where content might be inside a div inside th/td
                        else if (childNode.classList && childNode.classList.contains('ak-renderer-tableHeader-sortable-column')) {
                            const pElement = childNode.querySelector('p');
                            if (pElement) {
                                part = this.processParagraphContent(pElement);
                            } else {
                                part = this.getTextContent(childNode).replace(/\s*Sorting an icon that takes up space\s*/, '').trim(); // Clean up icon text
                            }
                        }

                    } else if (childNode.nodeType === Node.TEXT_NODE && childNode.textContent.trim()) {
                        part = childNode.textContent.trim();
                    }
                    if (part) contentParts.push(part);
                });
                let cellContent = contentParts.join('<br>').trim().replace(/^(<br>)+|(<br>)+$/g, '');
                 // If still empty, try direct text content of the cell as a last resort.
                if (!cellContent && cell.textContent) {
                    let directText = cell.textContent.trim();
                    // Remove known accessory text like sort icon placeholders if they are the only content
                    const sortIconTextPattern = /header\d+|Sort alphabetically A to Z|Sort alphabetically Z to A|No order|結合セルを含む表は並べ替えられません/i;
                    if (directText.match(sortIconTextPattern) && cell.querySelector('figure.ak-renderer-tableHeader-sorting-icon__wrapper')) {
                         // Try to find a paragraph if the direct text is just header stuff
                        const pElement = cell.querySelector('p');
                        if (pElement) {
                           directText = this.processParagraphContent(pElement);
                        } else {
                            directText = ''; // If it's just the sort icon stuff, make it empty
                        }
                    }
                    // Remove text from sorting icon if it was picked up
                    const sortingIconElement = cell.querySelector('.ak-renderer-tableHeader-sorting-icon');
                    if (sortingIconElement && sortingIconElement.textContent) {
                        directText = directText.replace(sortingIconElement.textContent.trim(), '').trim();
                    }
                    cellContent = directText;
                }


                // Place content and span markers
                markdownGrid[rIdx][currentGridCol] = cellContent;

                for (let c = 1; c < colspan; c++) {
                    if (currentGridCol + c < numGridCols) {
                        markdownGrid[rIdx][currentGridCol + c] = '>';
                    }
                }
                for (let r = 1; r < rowspan; r++) {
                    if (rIdx + r < numGridRows) {
                        markdownGrid[rIdx + r][currentGridCol] = '^';
                        for (let c = 1; c < colspan; c++) {
                            if (currentGridCol + c < numGridCols) {
                                markdownGrid[rIdx + r][currentGridCol + c] = '^';
                            }
                        }
                    }
                }
                currentGridCol += colspan; // Move to the next available column slot based on colspan
            });
        });

        // Filter out any fully null rows that might have been created if rowspan extended beyond actual content rows
        const finalTableData = markdownGrid.filter(row => row.some(cell => cell !== null));
        if (finalTableData.length === 0) {
             console.error('テーブルにデータがありません (after merge logic)');
             return '';
        }

        // Ensure all rows have the same number of columns, padding with empty strings
        const finalColumnCount = Math.max(...finalTableData.map(row => row.filter(c => c !== null).length), numGridCols);

        const processedTableData = finalTableData.map(row => {
            const newRow = [];
            let colIdx = 0;
            for (let i = 0; i < finalColumnCount && colIdx < row.length; i++) {
                if (row[colIdx] !== null) {
                    newRow.push(row[colIdx] === null ? '' : row[colIdx]); // Replace null with empty string if it somehow slipped through
                } else {
                     // This case should ideally be handled by rowspan/colspan markers.
                     // If a cell is genuinely null and not covered, it implies an irregular table structure
                     // or an issue in the previous logic. We push an empty string to maintain structure.
                    newRow.push('');
                }
                colIdx++;
            }
            // Pad if necessary after consuming all non-null original cells from the row
            while(newRow.length < finalColumnCount) {
                newRow.push('');
            }
            return newRow;
        });
        
        // All cells in markdownGrid that are still null should be empty strings for markdown
        processedTableData.forEach(row => {
            for(let i=0; i < row.length; i++) {
                if(row[i] === null) row[i] = '';
            }
        });


        if (processedTableData.length === 0) {
            console.error('テーブルにデータがありません');
            return '';
        }
        
        // Calculate column widths for formatting (use processedTableData)
        const columnWidths = Array(finalColumnCount).fill(0);
        processedTableData.forEach(row => {
            row.forEach((cell, colIndex) => {
                const textWidth = String(cell).replace(/<br>/g, '').length; // Ensure cell is string
                columnWidths[colIndex] = Math.max(columnWidths[colIndex] || 0, textWidth);
            });
        });
        columnWidths.forEach((_, i) => columnWidths[i] = Math.max(3, columnWidths[i]));


        let markdown = '';
        // Header row
        markdown += '| ' + processedTableData[0].map((cell, colIndex) => String(cell).padEnd(columnWidths[colIndex])).join(' | ') + ' |\n';
        // Separator row
        markdown += '| ' + columnWidths.map(width => '-'.repeat(width)).join(' | ') + ' |\n';
        // Data rows
        for (let i = 1; i < processedTableData.length; i++) {
            markdown += '| ' + processedTableData[i].map((cell, colIndex) => String(cell).padEnd(columnWidths[colIndex])).join(' | ') + ' |\n';
        }
        
        console.log('変換されたMarkdownテーブル (merged cells):', markdown);
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
                // テキストノードはそのまま出力。ただし、親がpなどの場合はそちらで処理される。
                // ここで直接 TEXT_NODE を childMarkdown に代入すると、
                // processParagraphContent などでのインライン要素処理と重複する可能性がある。
                // 基本的には Element Node の中でテキストを集約するので、ここは変更しない方が安全。
                // ただし、もし要素の直下にテキストがあり、それがどのElementの処理でも拾われない場合は考慮が必要。
                // 現状のロジックでは、ほとんどのテキストはP内などで処理される。
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

// popup.jsからのメッセージをリッスン
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "convertToMarkdown") {
        console.log("content.js: convertToMarkdownメッセージ受信");
        const conversionResult = window.myConfluenceConverter.convert();
        let pageTitle = "confluence-export"; // デフォルトタイトル
        let markdownContent = "";

        // contentArea の特定に失敗した場合でもタイトルを取得し、エラーメッセージと共に返す
        if (window.myConfluenceConverter.mode === null && conversionResult.markdown.startsWith("エラー:")) {
             pageTitle = conversionResult.title; // getPageTitle は呼ばれているはず
             markdownContent = conversionResult.markdown;
        } else {
            // 通常の変換処理
            const contentArea = window.myConfluenceConverter.mode === 'edit' ?
                                document.getElementById('ak-editor-textarea') :
                                document.querySelector('.ak-renderer-document');

            if (!contentArea) {
                pageTitle = window.myConfluenceConverter.getPageTitle(); // モードが不明でもタイトル取得試行
                markdownContent = "エラー: コンテンツエリアが見つかりませんでした。";
            } else {
                pageTitle = window.myConfluenceConverter.getPageTitle();
                let md = '';
                const elements = contentArea.children;
                for (let i = 0; i < elements.length; i++) {
                    const element = elements[i];
                    if (element.tagName === 'SPAN' && element.getAttribute('data-testid') === 'visually-hidden-heading-anchor') {
                        continue;
                    }
                    md += window.myConfluenceConverter.convertElement(element) + '\n\n';
                }
                markdownContent = md.trim();
            }
        }
        
        console.log("content.js: 変換結果を送信:", { title: pageTitle, markdown: markdownContent });
        sendResponse({ title: pageTitle, markdown: markdownContent });
        return true; // 非同期レスポンスを示すためにtrueを返す
    }
});

// 必要に応じて、DOMの変更を監視したり、初期化処理を行う 