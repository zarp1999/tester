# CityJSON 3D Viewer

React と Three.js を使用した CityJSON データの 3D ビューアーアプリケーションです。

## 概要

このプロジェクトは、CityJSON 形式の都市データを 3D 空間で可視化するための Web アプリケーションです。インタラクティブな 3D シーン、レイヤー管理、パイプライン情報の表示など、複数の機能を提供します。

## 主な機能

- **3D ビューア**: Three.js を使用した CityJSON データの 3D 可視化
- **レイヤーパネル**: データレイヤーの管理と表示/非表示の切り替え
- **パイプライン情報表示**: パイプラインに関する詳細情報の表示
- **パイプライン操作**: パイプラインに対する各種アクションの実行
- **マップコンポーネント**: 2D マップビューの表示
- **スカイコンポーネント**: リアルな空の背景表示
- **無限グリッド**: 3D シーン内のグリッド表示
- **オブジェクト選択**: 3D オブジェクトのクリック選択機能
- **カメラ制御**: インタラクティブなカメラ移動と視点変更

## 技術スタック

- **React** (v18.2.0) - UI フレームワーク
- **Three.js** (v0.157.0) - 3D グラフィックスライブラリ
- **lil-gui** (v0.20.0) - GUI コントロール
- **React Scripts** (v5.0.1) - ビルドツール

## 必要要件

- Node.js (v14 以上推奨)
- npm または yarn

## インストール

1. リポジトリをクローン:
```bash
git clone <repository-url>
cd tester
```

2. 依存関係をインストール:
```bash
npm install
```

## 使用方法

### 開発サーバーの起動

```bash
npm start
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてアプリケーションにアクセスします。

### プロダクションビルド

```bash
npm run build
```

最適化されたプロダクションビルドが `build` フォルダに生成されます。

### テストの実行

```bash
npm test
```

## プロジェクト構造

```
tester/
├── public/                          # 静的ファイル
│   ├── Cityjson_sample.json        # CityJSON サンプルデータ
│   ├── layer_panel.json            # レイヤーパネル設定
│   ├── shape_type.json             # 形状タイプ定義
│   ├── source_types.json           # ソースタイプ定義
│   ├── user_pos_1.json             # ユーザー位置データ
│   └── index.html                  # HTML テンプレート
├── src/                             # ソースコード
│   ├── components/                  # React コンポーネント
│   │   ├── InfiniteGridHelper.js   # 無限グリッドヘルパー
│   │   ├── PipelineActionButtons.js    # パイプライン操作ボタン
│   │   ├── PipelineActionButtons.css   # パイプライン操作ボタンスタイル
│   │   ├── PipelineInfoDisplay.js      # パイプライン情報表示
│   │   ├── PipelineInfoDisplay.css     # パイプライン情報スタイル
│   │   ├── Scene3D.js              # メイン 3D シーン
│   │   ├── Scene3D.css             # 3D シーンスタイル
│   │   └── SkyComponent.js         # 空背景コンポーネント
│   ├── App.js                       # メインアプリケーション
│   ├── App.css                      # アプリケーションスタイル
│   ├── ViewerApp.js                 # ビューアーレイアウト
│   ├── ViewerApp.module.css         # ビューアースタイル
│   ├── LayerPanel.js                # レイヤーパネル
│   ├── MapComponent.js              # マップコンポーネント
│   ├── index.js                     # エントリーポイント
│   └── index.css                    # グローバルスタイル
├── package.json                     # プロジェクト設定
└── README.md                        # このファイル
```

## データファイル

アプリケーションは以下の JSON ファイルを使用します：

- **Cityjson_sample.json**: CityJSON 形式の 3D 都市データ
- **layer_panel.json**: レイヤーパネルの設定情報
- **shape_type.json**: 形状タイプの定義
- **source_types.json**: データソースタイプの定義
- **user_pos_1.json**: ユーザー位置情報

## コンポーネント説明

### Scene3D
メインの 3D シーンコンポーネント。CityJSON データを Three.js を使用してレンダリングします。

### PipelineInfoDisplay
パイプラインに関する情報（距離、角度、流向など）を表示するコンポーネント。

### PipelineActionButtons
パイプラインに対する操作（追加、削除、確定など）を行うためのボタンコンポーネント。

### LayerPanel
データレイヤーの管理と表示制御を行うパネルコンポーネント。

### MapComponent
2D マップビューを提供するコンポーネント。

### SkyComponent
リアルな空の背景を表示するコンポーネント。

### InfiniteGridHelper
3D シーン内に無限グリッドを表示するヘルパーコンポーネント。

## カスタマイズ

### データの変更
`public` フォルダ内の JSON ファイルを編集することで、表示するデータをカスタマイズできます。

### スタイルの変更
各コンポーネントの CSS ファイルを編集することで、見た目をカスタマイズできます。

## トラブルシューティング

### データが読み込まれない場合
- `public` フォルダに必要な JSON ファイルがすべて存在することを確認してください
- ブラウザの開発者コンソールでエラーメッセージを確認してください

### 3D シーンが表示されない場合
- ブラウザが WebGL をサポートしていることを確認してください
- ブラウザのハードウェアアクセラレーションが有効になっていることを確認してください

## ライセンス

このプロジェクトはプライベートプロジェクトです。

## 貢献

バグ報告や機能リクエストは、issue tracker を通じてお願いします。

---

**開発者向けメモ**: このプロジェクトは React Scripts を使用しているため、設定のカスタマイズが必要な場合は `npm run eject` を実行してください（不可逆的な操作です）。

