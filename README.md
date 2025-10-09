# CityJSON 3D ビューア

管路インフラ（水道、下水道、電道など）を3次元で可視化するWebアプリケーションです。

## 機能

### 1. 3次元表示
- 球形、円筒形、直方体などの基本図形で管路を表示
- InfiniteGridHelperによる無限平面グリッド
- Three.jsによるリアルタイム3Dレンダリング
- シャドウとライティング効果

### 2. 付帯情報表示
- オブジェクトをクリックすると詳細情報を表示
- 管路の材質、直径、長さ、設置日などの属性情報
- 座標情報（位置、スケール）

### 3. レイヤー制御
- 水道、下水道、電道、ガスなどのレイヤーを個別に表示/非表示
- レイヤーごとの色分け表示
- 全表示/全非表示の一括操作

### 4. カメラ操作
- マウスドラッグで視点回転
- マウスホイールでズーム
- 右クリックドラッグで平行移動
- 保存されたカメラ位置からのクイックアクセス

## 技術スタック

- **React 18**: UIフレームワーク
- **Three.js**: 3Dレンダリングエンジン（純粋なThree.jsライブラリを直接使用）
- **JavaScript**: プログラミング言語

## プロジェクト構成

```
cityjson-3d-viewer/
├── public/
│   ├── index.html
│   ├── Cityjson_sample.json      # 管路オブジェクトデータ
│   ├── layer_panel.json          # レイヤー設定
│   ├── shape_type.json           # 図形タイプ定義
│   ├── source_types.json         # ソースタイプ定義
│   └── user_pos_1.json           # カメラ位置プリセット
├── src/
│   ├── components/
│   │   ├── Scene3D.js            # メイン3Dシーン（Three.js直接使用）
│   │   ├── Scene3D.css
│   │   ├── InfoPanel.js          # 情報パネル
│   │   ├── InfoPanel.css
│   │   ├── LayerControl.js       # レイヤー制御パネル
│   │   ├── LayerControl.css
│   │   ├── CameraControl.js      # カメラ制御パネル
│   │   └── CameraControl.css
│   ├── App.js                    # メインアプリケーション
│   ├── App.css
│   ├── index.js                  # エントリーポイント
│   └── index.css
├── package.json
└── README.md
```

## セットアップと実行

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 開発サーバーの起動

```bash
npm start
```

ブラウザが自動的に開き、`http://localhost:3000` でアプリケーションが表示されます。

### 3. ビルド（本番環境用）

```bash
npm run build
```

`build/` ディレクトリに最適化されたファイルが生成されます。

## データ形式

### CityJSON形式（Cityjson_sample.json）

```json
{
  "type": "CityJSON",
  "version": "1.1",
  "objects": [
    {
      "id": "pipe_001",
      "type": "cylinder",
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 10, 1],
      "color": "#2196F3",
      "attributes": {
        "name": "水道管A",
        "material": "鋼管",
        "diameter": 300,
        "length": 10,
        "installDate": "2020-04-15"
      }
    }
  ]
}
```

### サポートされる図形タイプ
- `cylinder`: 円筒形（管路）
- `sphere`: 球形（接続点）
- `box`: 直方体（制御ボックス）

## 将来の拡張予定

### REST API連携
現在はローカルJSONファイルからデータを読み込んでいますが、将来的には以下の機能を実装予定：

1. カメラ移動時にREST APIを呼び出し
2. 視点範囲内の管路データを動的に取得
3. レイヤー切り替え時のデータフィルタリング
4. リアルタイムデータ更新

### API仕様（計画中）

```javascript
// カメラ位置からデータを取得
GET /api/objects?x={x}&y={y}&z={z}&radius={radius}&layers={layer1,layer2}

// 特定オブジェクトの詳細を取得
GET /api/objects/{objectId}

// カメラ位置を保存
POST /api/user-positions
```

## 使用方法

1. **3D表示の操作**
   - 左クリック + ドラッグ: カメラ回転
   - マウスホイール: ズームイン/アウト
   - 右クリック + ドラッグ: カメラ平行移動

2. **オブジェクトの選択**
   - オブジェクトにマウスオーバーするとハイライト表示
   - クリックすると右側に詳細情報パネルが表示

3. **レイヤー制御**
   - 左側のレイヤーパネルでレイヤーのON/OFF切り替え
   - 各レイヤーの色を確認可能

4. **カメラ位置**
   - 右上のカメラパネルから保存済みの視点を選択
   - クイックに特定の視点へ移動可能

## トラブルシューティング

### 画面が真っ白になる場合
- ブラウザのコンソールでエラーを確認
- `npm install` を再実行して依存関係を再インストール

### 3Dが表示されない場合
- WebGLがブラウザでサポートされているか確認
- ハードウェアアクセラレーションが有効か確認

### データが読み込まれない場合
- `public/` フォルダ内にJSONファイルが存在するか確認
- ブラウザの開発者ツールのNetworkタブでファイルの読み込み状況を確認

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## Three.js実装の詳細

このプロジェクトは**純粋なThree.jsライブラリ**を直接使用して実装されています。

### Scene3D.jsの主要な実装

1. **シーンの初期化**
   ```javascript
   const scene = new THREE.Scene();
   const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
   const renderer = new THREE.WebGLRenderer({ antialias: true });
   ```

2. **OrbitControlsの使用**
   ```javascript
   import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
   const controls = new OrbitControls(camera, renderer.domElement);
   ```

3. **3Dオブジェクトの生成**
   - `THREE.CylinderGeometry`: 円筒形（管路）
   - `THREE.SphereGeometry`: 球形（接続点）
   - `THREE.BoxGeometry`: 直方体（制御ボックス）

4. **インタラクション**
   - `THREE.Raycaster`: マウスとオブジェクトの交差判定
   - ホバー時のハイライト効果
   - クリック時のオブジェクト情報表示

5. **カスタムシェーダー**
   - 無限グリッドにはGLSLシェーダーを使用
   - フラグメントシェーダーとバーテックスシェーダーで動的なグリッド表示

### Reactとの統合

- `useRef`でThree.jsオブジェクトを管理
- `useEffect`でシーンの初期化とクリーンアップ
- アニメーションループは`requestAnimationFrame`で実装
- レスポンシブ対応（ウィンドウリサイズ対応）

## お問い合わせ

問題や質問がある場合は、GitHubのIssuesセクションで報告してください。

