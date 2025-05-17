# Confluence to Markdown 変換プラグイン仕様書

## 1. 目的
- Confluenceページの内容をMarkdown形式で出力するChromeプラグイン開発
- Cursorなどのエディタで作成したmarkdownファイルを再度編集可能な形式で取得

## 2. 主要機能
- Confluenceページを表示中に、そのコンテンツをMarkdown形式に変換
- 変換されたMarkdownをクリップボードにコピー、またはファイルとして保存

## 3. 変換対象要素
- 見出し（`<h1>`, `<h2>`, `<h3>`タグ、`data-prosemirror-node-name="heading"`属性、`data-drag-handler-node-type="heading-N"`属性）→ `#`, `##`, `###`
- 太字（`<strong data-prosemirror-mark-name="strong">`）→ `**テキスト**`
- イタリック体（`<em>` や `<em data-prosemirror-mark-name="em">` (仮)）→ `*テキスト*`
- 色付きテキスト（`<span style="color: ...;">`） → `<span style="color: ...;">テキスト</span>` (spanタグを維持)
- 箇条書き（`<ul data-prosemirror-node-name="bulletList">`内の`<li data-prosemirror-node-name="listItem">`、インデントは `data-indent-level`属性）→ `- アイテム`
- 番号付きリスト（`<ol data-prosemirror-node-name="orderedList">`内の`<li data-prosemirror-node-name="listItem">`、インデントは `data-indent-level`属性）→ `1. アイテム`
- テーブル（`<div data-prosemirror-node-name="table">`内の`<table>`, `<tr>`, `<th>`, `<td>`タグ。ProseMirror属性として`tableRow`, `tableHeader`, `tableCell`）→ Markdownテーブル形式
- 水平線（`<hr data-prosemirror-node-name="rule">`）→ `---`
- コードブロック（`<pre>` や `<code>` を含む要素、Confluenceの専用クラスや属性を確認） → ````言語コード````
- インラインコード（`<code>`タグ、Confluenceの専用クラスや属性を確認） → `` `コード` ``
- 引用（`<blockquote>`タグ、Confluenceの専用クラスや属性を確認） → `> 引用テキスト`
- リンク（`<a>`タグ、`href`属性） → `[テキスト](URL)`
- 画像（`<img>`タグ、`src`属性、`alt`属性） → `![代替テキスト](URL)`
- チェックボックス（現状は`<p>`タグ内のテキストだが、Confluenceのタスクリスト要素（例：`<div data-task-local-id="...">`や`<span class="task-list-item">`など）を想定） → `- [ ]` または `- [x]`
- 情報パネル（ノート/ヒント/警告など）（Confluenceの専用divコンテナやクラス（例：`class="ak-panel"` `data-panel-type="info"`など）を確認）
- 折りたたみセクション（Confluenceの専用マクロやクラス構造を確認）
- 添付ファイル参照（Confluenceの専用マクロやリンク形式を確認）

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
