# Confluence to Markdown 変換プラグイン仕様書

## 1. 目的
- Confluenceページの内容をMarkdown形式で出力するChromeプラグイン開発
- Cursorなどのエディタで作成したmarkdownファイルを再度編集可能な形式で取得

## 2. 主要機能
- Confluenceページを表示中に、そのコンテンツをMarkdown形式に変換
- 変換されたMarkdownをクリップボードにコピー、またはファイルとして保存

## 3. 変換対象要素
- 見出し（`<h1>`, `<h2>`, `<h3>`タグ、`data-prosemirror-node-name="heading"`属性、`data-drag-handler-node-type="heading-N"`属性）→ `#`, `##`, `###`
- 太字（`<strong>`タグ、`<b data-prosemirror-mark-name="strong">`）→ `**テキスト**`
- イタリック体（`<em>`タグ、`<i data-prosemirror-mark-name="em">`）→ `*テキスト*`
- 色付きテキスト（`<span class="fabric-text-color-mark" style="color: ...;">`） → `<span style="color: ...;">テキスト</span>` (spanタグとstyle属性を維持)
- 箇条書き（`<ul>`内の`<li>`、インデントは `data-indent-level`属性で処理）→ `- アイテム` (ネスト対応)
- 番号付きリスト（`<ol>`内の`<li>`、インデントは `data-indent-level`属性で処理）→ `1. アイテム` (ネスト対応)
- テーブル（`<div class="pm-table-container">`内の`<table>`, `<tr>`, `<th>`, `<td>`タグ。セル内のテキスト、太字、リスト（セル内改行は`<br>`）も変換）→ Markdownテーブル形式
- 水平線（`<hr data-prosemirror-node-name="rule">`）→ `---`
- コードブロック（`<pre>`タグ） → ````
テキスト
```` (現状、言語指定は未対応)
- インラインコード（`<pre>`タグ内にない`<code>`タグ） → `` `コード` ``
- 引用（`<blockquote>`タグ） → `> 引用テキスト` (複数行対応)
- リンク（`<a>`タグ、`href`属性） → `[テキスト](URL)`
- 画像（`<img>`タグ、`src`属性、`alt`属性） → `![代替テキスト](URL)`
- チェックボックス:
    - Confluenceのタスクリスト（例: `<div data-task-list-local-id> <div data-task-local-id> <input type="checkbox"> <div data-component="content">`） → `[ ] テキスト` または `[x] テキスト`
    - 段落(`p`)内のチェックボックス（例: `<p><input type="checkbox">テキスト</p>`） → `[ ] テキスト` または `[x] テキスト`
- 情報パネル（ノート/ヒント/警告など）（`<div class="ak-panel" data-panel-type="...">`）→ `<div class="ak-panel" data-panel-type="...">Markdown変換された内部コンテンツ</div>` (HTML構造を維持し、内部コンテンツを再帰的にMarkdown変換)
- 折りたたみセクション（Confluenceの専用マクロやクラス構造を確認）→ (未実装)
- 添付ファイル参照（Confluenceの専用マクロやリンク形式を確認）→ (未実装)

## 4. 技術仕様
- Chrome Extension Manifest V3形式
- DOM解析によるHTMLからMarkdownへの変換
- Confluence特有のDOM構造に対応した変換ロジック（`data-prosemirror-` 属性などを活用した要素特定）

## 5. UI仕様
- ブラウザツールバーに配置されるアイコン
- クリック時に表示されるポップアップ（変換とコピー/保存オプション）
- 変換成功時の通知表示

## 6. 開発工程
1. DOM構造分析とパース方法の確立
2. 変換ロジックの実装
3. UI実装
4. テスト・デバッグ
5. 配布用パッケージング

## 7. 制限事項・課題
- Confluenceの複雑な要素（マクロ等）への対応
- ページ構造変更時の互換性維持方法（ConfluenceのHTML構造は変更される可能性があるため、定期的な監視と、変更に追従するための迅速なアップデート体制の確立が課題となる。）
- 画像などの添付ファイル処理
- 複雑なネストされた要素の適切な変換
