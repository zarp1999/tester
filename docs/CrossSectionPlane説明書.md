# CrossSectionPlane.js 実装説明書

## 目次
1. [概要](#概要)
2. [主要な機能](#主要な機能)
3. [クラス構造](#クラス構造)
4. [座標系と計算ロジック](#座標系と計算ロジック)
5. [主要メソッドの詳細](#主要メソッドの詳細)
6. [データフロー](#データフロー)
7. [トラブルシューティング](#トラブルシューティング)

---

## 概要

`CrossSectionPlane.js`は、3D管路ビューアーで**垂直断面図**を生成するためのコンポーネントです。管路をクリックすると、その位置を通る垂直平面（Z軸に垂直）での断面が表示されます。

### 主な機能
- 📏 **グリッド線**: 1m間隔で深さを示す水平線
- 📍 **縦線**: 地表面から各管路の上端（天端）までの深さを示す線
- 🏷️ **深さラベル**: 各管路の深さを数値で表示
- ⭕ **断面形状**: CSG（Constructive Solid Geometry）を使用した正確な管路の切り口

---

## 主要な機能

### 1. 断面平面の定義

```
クリック位置（X, Y, Z）
         ↓
断面平面: Z = clickPoint.z（固定）
         ↓
この平面上で管路を切断して表示
```

**図解**:
```
        Y軸（上）
         ↑
         |     [断面平面]
         |    ┊         ┊
         |    ┊  Z=150  ┊
         |────┊─────────┊──→ X軸（東西）
         |    ┊         ┊
         |    ┊         ┊
         ↓
      Z軸（南北）
```

### 2. グリッド線システム

**目的**: 深さの基準を提供

```javascript
// 0m（地表面）から-50mまで、1m間隔でグリッド線を描画
for (let depth = 0; depth >= -50; depth -= 1) {
  this.drawEastWestLine(depth, linePosition, 0x888888, false);
}
```

**表示例**:
```
Y=0m   ━━━━━━━━━━━━━━  地表面
Y=-1m  ━━━━━━━━━━━━━━  グリッド線
Y=-2m  ━━━━━━━━━━━━━━  グリッド線
...
Y=-50m ━━━━━━━━━━━━━━  最下層
```

### 3. 縦線と深さラベル

**目的**: 各管路の深さを視覚化

```
Y=0 (地表面) ━━━━━━━━━━
     |
     | ← 縦線（管路の色）
     | 
Y=-6.2m      "6.20m" ← ラベル
            ─────── ← 管路の上端（天端）
              ╱   ╲
             │管路│ (半径0.3m)
              ╲   ╱
Y=-6.8m      ─────── ← 管路の中心
```

---

## クラス構造

### コンストラクタ

```javascript
constructor(scene, camera, objectsRef) {
  this.scene = scene;              // Three.jsシーン
  this.camera = camera;            // カメラ（ラベルスケール調整用）
  this.objectsRef = objectsRef;    // 全管路オブジェクトへの参照
  
  // 描画オブジェクトの配列
  this.depthLines = [];            // グリッド線と縦線
  this.crossSections = [];         // CSG断面形状
  this.depthLabels = [];           // 深さラベル（スプライト）
  this.depthLabelPositions = [];   // ラベル位置（スケール調整用）
  
  // 表示状態
  this.showCrossSections = false;  // 断面形状の表示フラグ（7キーで切替）
}
```

### 主要プロパティ

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| `scene` | THREE.Scene | Three.jsシーン（描画対象） |
| `camera` | THREE.Camera | カメラ（ラベルスケール調整用） |
| `objectsRef` | React.Ref | 全管路オブジェクトへの参照 |
| `depthLines` | Array | グリッド線と縦線の配列 |
| `crossSections` | Array | CSG断面形状の配列 |
| `depthLabels` | Array | 深さラベルの配列 |
| `showCrossSections` | Boolean | 断面形状の表示/非表示 |

---

## 座標系と計算ロジック

### 1. 座標変換の理解

管路データの`start_point_depth`と`end_point_depth`は、**管路の天端（上端）の深さ**を表します（正の値）。

```javascript
// 例: start_point_depth = 650（単位: cm）
const startDepth = 650 / 100 = 6.5m（天端の深さ）
const radius = 0.3m

// Three.js座標系での管路中心位置
const startCenterY = -(6.5 + 0.3) = -6.8m
```

**計算式の詳細**:
```javascript
// 深さ属性がある場合
const startCenterY = startDepth >= 0 ? -(startDepth + radius) : startDepth;
```

**理由**:
- `startDepth`は正の値で天端の深さ（例: 6.5m）
- Three.jsのY軸は上向きが正なので、負の値に変換（-6.5m）
- 天端から半径分下げて中心位置を計算（-6.5 - 0.3 = -6.8m）

**図解**:
```
データ: startDepth = 6.5m（天端の深さ、正の値）

Three.js座標系:
Y=0m        ━━━━━━━━  地表面
            
Y=-6.5m     ─────── ← 天端（startDepth）
              ╱   ╲
Y=-6.8m      ─────── ← 中心（startCenterY）
             │管路│
              ╲   ╱
Y=-7.1m      ─────── ← 底端
```

### 2. 断面平面との交点計算

管路中心線と断面平面（Z=crossSectionZ）の交点を求めます。

```javascript
// 管路の始点と終点
const start = new THREE.Vector3(x1, y1, z1);
const end = new THREE.Vector3(x2, y2, z2);
const direction = end.clone().sub(start);

// パラメトリック方程式: P = start + t × direction
// Z座標がcrossSectionZになるtを求める
const t = (crossSectionZ - start.z) / direction.z;

// 交点
const intersectionPoint = start.clone().add(direction.clone().multiplyScalar(t));
```

**図解**:
```
管路:
始点 ●━━━━━━━━━━━● 終点
    (x1,y1,z1)    (x2,y2,z2)
         ┊
断面平面 ┊ Z=150
         ┊
         ● ← 交点 (x, y, 150)
```

### 3. 縦線の終点計算

```javascript
// 管路中心の深さ
const pipeDepth = intersectionPoint.y;  // 例: -6.8m

// 管路の上端（天端）の深さ
const pipeTopY = pipeDepth + radius;    // 例: -6.8 + 0.3 = -6.5m

// 縦線: Y=0（地表面）から Y=-6.5m（天端）まで
```

---

## 主要メソッドの詳細

### 1. `createCrossSection(pipeObject, clickPoint)`

**目的**: 管路クリック時に断面を生成するエントリーポイント

**処理フロー**:
```
1. 既存の断面をクリア（clear()）
2. 管路オブジェクトの検証
3. drawClickedPipeCrossSection()を呼び出し
```

**使用例**:
```javascript
crossSectionPlane.createCrossSection(clickedPipe, clickPosition);
```

---

### 2. `drawClickedPipeCrossSection(pipeObject, clickPoint)`

**目的**: クリックした管路の断面を描画

**処理ステップ**:

#### ステップ1: 管路データの取得
```javascript
// 半径の取得
let radius = objectData.attributes?.radius || 0.3;
if (radius > 5) radius = radius / 1000;  // mm→m変換
radius = Math.max(radius, 0.05);         // 最小値0.05m
```

#### ステップ2: 座標変換
```javascript
// 管路の始点と終点の中心位置を計算
const startDepth = attributes.start_point_depth / 100;
const endDepth = attributes.end_point_depth / 100;
const startCenterY = startDepth >= 0 ? -(startDepth + radius) : startDepth;
const endCenterY = endDepth >= 0 ? -(endDepth + radius) : endDepth;
```

#### ステップ3: 断面平面との交点計算
```javascript
// 断面平面（Z=clickPoint.z）と管路中心線の交点
const t = (clickPoint.z - start.z) / direction.z;
const intersectionPoint = start.clone().add(direction.clone().multiplyScalar(t));
```

#### ステップ4: グリッド線の描画
```javascript
// 0m〜-50m、1m間隔
for (let depth = 0; depth >= -50; depth -= 1) {
  this.drawEastWestLine(depth, linePosition, 0x888888, false);
  this.drawVerticalLinesAtDepth(depth, clickPoint.z);
}
```

#### ステップ5: クリックした管路の縦線描画
```javascript
this.drawVerticalLine(linePosition, intersectionPoint.y, color, radius);
```

#### ステップ6: 他の管路の縦線描画
```javascript
this.drawVerticalLinesAtCrossSectionPlane(clickPoint.z, pipeObject);
```

#### ステップ7: CSG断面描画
```javascript
this.drawCrossSectionCircle(center, radius, axisDirection, color, pipeObject, clickPoint.z);
```

---

### 3. `drawVerticalLinesAtCrossSectionPlane(crossSectionZ, excludePipeObject)`

**目的**: 断面平面と交差する他の管路に縦線を描画

**重要なチェック**:
```javascript
// 1. 管路が断面平面と交差しているか
if (crossSectionZ < minZ || crossSectionZ > maxZ) {
  return;  // 交差していない
}

// 2. 交点が管路の範囲内にあるか
if (t >= 0 && t <= 1) {
  // 交点で縦線を描画
}
```

---

### 4. `drawVerticalLinesAtDepth(targetDepth, crossSectionZ)`

**目的**: グリッド線の深さで管路を切っている位置に縦線を描画

**重要なチェック**:
```javascript
// 1. グリッド線が管路を切っているか
if (targetDepth >= minY && targetDepth <= maxY) {
  // Y座標がtargetDepthになる交点を計算
  const t = (targetDepth - start.y) / direction.y;
  
  // 2. 交点が断面平面の近くにあるか
  if (Math.abs(intersectionPoint.z - crossSectionZ) <= radius) {
    // 縦線を描画
  }
}
```

**なぜこのチェックが必要か**:

長い管路の場合、グリッド線との交点が断面平面から離れている可能性があります。

```
管路: Z=100 〜 Z=200（長さ100m）
断面平面: Z=150
グリッド線: Y=-7m

交点のZ座標が140mの場合:
→ 断面平面（Z=150）から10m離れている
→ スキップする
```

---

### 5. `drawVerticalLine(position, pipeDepth, color, radius)`

**目的**: 地表面から管路の上端まで縦線を描画

**処理**:
```javascript
// 1. グループ作成（線とラベルをまとめて管理）
const lineGroup = new THREE.Group();
lineGroup.position.set(position.x, 0, position.z);

// 2. 縦線の終点計算
const pipeTopY = pipeDepth + radius;  // 管路の上端

// 3. Line2で太い線を描画
const lineGeometry = new LineGeometry();
lineGeometry.setPositions([0, 0, 0, 0, pipeTopY, 0]);
const line = new Line2(lineGeometry, lineMaterial);

// 4. ラベルを中点に配置
const labelY = pipeTopY / 2;
const labelSprite = this.createDepthLabelSprite(pipeTopY);
labelSprite.position.set(0, labelY, 0);

// 5. グループに追加してシーンに配置
lineGroup.add(line);
lineGroup.add(labelSprite);
this.scene.add(lineGroup);
```

---

### 6. `drawEastWestLine(depth, center, color, highlight, showLabel)`

**目的**: 東西方向（X軸方向）のグリッド線を描画

**パラメータ**:
- `depth`: グリッド線の深さ（Y座標）
- `center`: 線の中心位置（X, Z座標）
- `color`: 線の色
- `highlight`: 強調表示するか（太く不透明にする）
- `showLabel`: ラベルを表示するか

**実装**:
```javascript
// 1. 東西方向の線（長さ1000m）
const startPoint = new THREE.Vector3(center.x - 500, depth, center.z);
const endPoint = new THREE.Vector3(center.x + 500, depth, center.z);

// 2. Line2で描画
const line = new Line2(lineGeometry, lineMaterial);

// 3. ラベル表示（10m間隔、または強調表示の場合）
if (showLabel && (highlight || Math.abs(depth) % 10 === 0)) {
  this.drawDepthLabel(depth, labelPosition, color);
}
```

---

### 7. `drawCSGCrossSection(pipeObject, crossSectionZ, color)`

**目的**: CSGを使用して垂直面で切断した正確な断面を描画

**CSG（Constructive Solid Geometry）とは**:
3Dオブジェクト同士の論理演算（和集合・差集合・**積集合**）を行う技術

**処理ステップ**:

#### ステップ1: 管路メッシュの準備
```javascript
const pipeMesh = new THREE.Mesh(
  pipeObject.geometry.clone(),
  new THREE.MeshBasicMaterial({ color: color })
);
pipeMesh.position.copy(pipeObject.position);
pipeMesh.rotation.copy(pipeObject.rotation);
pipeMesh.updateMatrix();
```

#### ステップ2: 断面平面を表す薄いボックスを作成
```javascript
const planeGeometry = new THREE.BoxGeometry(1000, 1000, 0.01);
const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
planeMesh.position.set(0, 0, crossSectionZ);  // Z軸に垂直
planeMesh.updateMatrix();
```

**図解**:
```
        Y軸
         ↑
         |     [薄いボックス]
         |    ┌─────────┐
         |    │ 厚さ0.01m│ 
         |────│─────────│──→ X軸
         |    └─────────┘
         |      Z = crossSectionZ
         ↓
      Z軸
```

#### ステップ3: CSGで積集合を計算
```javascript
const intersectionMesh = CSG.intersect(pipeMesh, planeMesh);
```

**結果**:
```
[管路メッシュ]  ∩  [薄い板]  =  [断面形状]
    (円筒)      AND   (平面)      (楕円または円)
```

- 管路が垂直な場合 → 円形
- 管路が斜めの場合 → 楕円形

#### ステップ4: マテリアルとvisibilityの設定
```javascript
intersectionMesh.material = new THREE.MeshBasicMaterial({
  color: color,
  transparent: true,
  opacity: 0.8
});
intersectionMesh.visible = this.showCrossSections;  // 7キーで切替
```

---

### 8. `createDepthLabelSprite(depth)`

**目的**: 深さを表示するテキストスプライトを作成

**処理**:
```javascript
// 1. キャンバスにテキストを描画
const canvas = document.createElement('canvas');
canvas.width = 1024;
canvas.height = 256;

const context = canvas.getContext('2d');
context.fillStyle = 'white';
context.font = 'Bold 120px Arial';
context.fillText(`${Math.abs(depth).toFixed(2)}m`, 512, 128);

// 2. キャンバスをテクスチャに変換
const texture = new THREE.CanvasTexture(canvas);

// 3. スプライトを作成
const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
sprite.scale.set(2, 0.5, 1);

return sprite;
```

---

### 9. `update()`

**目的**: カメラからの距離に応じてラベルのスケールを調整

**処理**:
```javascript
for (let i = 0; i < this.depthLabels.length; i++) {
  const sprite = this.depthLabels[i];
  const position = this.depthLabelPositions[i];
  
  // カメラからの距離を計算
  const distance = this.camera.position.distanceTo(position);
  
  // 距離に応じてスケールを調整
  const scaleFactor = (distance / 20) * 2;  // baseDistance=20, baseScale=2
  const clampedScale = Math.max(0.5, Math.min(5, scaleFactor));
  
  sprite.scale.set(clampedScale, clampedScale * 0.25, 1);
}
```

**効果**: カメラが近づくとラベルが小さく、離れると大きくなり、常に読みやすいサイズを維持

---

### 10. `clear()`

**目的**: すべての描画オブジェクトを削除してメモリを解放

**処理**:
```javascript
// 1. 深さ線（グリッド線と縦線）を削除
this.depthLines.forEach(line => {
  this.scene.remove(line);
  if (line.geometry) line.geometry.dispose();
  if (line.material) line.material.dispose();
});

// 2. 深さラベルを削除
this.depthLabels.forEach(sprite => {
  this.scene.remove(sprite);
  if (sprite.material?.map) sprite.material.map.dispose();
  if (sprite.material) sprite.material.dispose();
});

// 3. 断面形状を削除
this.crossSections.forEach(mesh => {
  this.scene.remove(mesh);
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) mesh.material.dispose();
});

// 4. 配列をクリア
this.depthLines = [];
this.depthLabels = [];
this.depthLabelPositions = [];
this.crossSections = [];
```

**重要**: Three.jsではメモリリークを防ぐため、`geometry`と`material`の`dispose()`が必要

---

## データフロー

### 管路クリック時の処理フロー

```
1. ユーザーが管路をクリック
   ↓
2. Scene3D.js が CrossSectionPlane.createCrossSection() を呼び出し
   ↓
3. 既存の断面をクリア (clear())
   ↓
4. drawClickedPipeCrossSection()
   ├─ 管路データの取得と座標変換
   ├─ 断面平面との交点計算
   ├─ グリッド線の描画 (drawEastWestLine)
   ├─ クリックした管路の縦線描画 (drawVerticalLine)
   ├─ 他の管路の縦線描画
   │  ├─ drawVerticalLinesAtCrossSectionPlane
   │  └─ drawVerticalLinesAtDepth
   └─ CSG断面の描画 (drawCrossSectionCircle → drawCSGCrossSection)
   ↓
5. シーンに表示
   ↓
6. アニメーションループで update() が呼ばれ、ラベルスケールを調整
```

### 7キー押下時の処理フロー

```
1. ユーザーが7キーを押す
   ↓
2. Scene3D.js が CrossSectionPlane.toggleCrossSections() を呼び出し
   ↓
3. showCrossSections フラグを反転
   ↓
4. 全てのcrossSectionsの visible プロパティを更新
   ├─ true: 断面形状が表示、管路は非表示
   └─ false: 断面形状が非表示、管路は表示
   ↓
5. Scene3D.js で管路の visible プロパティも切り替え
```

---

## トラブルシューティング

### 問題1: 縦線が管路まで届かない

**原因**: 座標変換の計算ミス

**チェックポイント**:
```javascript
// 正しい計算式（>= を使用）
const startCenterY = startDepth >= 0 ? -(startDepth + radius) : startDepth;

// 間違い（> を使用すると depth=0 の場合に問題）
const startCenterY = startDepth > 0 ? -(startDepth + radius) : startDepth;
```

### 問題2: 長い管路で不要な縦線が表示される

**原因**: グリッド線と管路の交点が断面平面から離れている

**解決方法**: 交点のZ座標をチェック
```javascript
if (Math.abs(intersectionPoint.z - crossSectionZ) > radius) {
  return;  // 断面平面から離れすぎている場合はスキップ
}
```

### 問題3: 傾斜管路で縦線の位置がずれる

**原因**: 管路全体の最も高い位置を使用していた

**解決方法**: 断面平面との交点の深さを使用
```javascript
// 正しい
const pipeDepth = intersectionPoint.y;

// 間違い
const pipeDepth = Math.max(start.y, end.y);
```

### 問題4: ラベルに0が表示されない

**原因**: 深さ0の管路で縦線が地表面より上に描画されている

**解決方法**: `>=` 条件を使用
```javascript
const startCenterY = startDepth >= 0 ? -(startDepth + radius) : startDepth;
```

### 問題5: メモリリーク

**原因**: dispose()を呼んでいない

**解決方法**: clear()で確実にdispose()
```javascript
if (line.geometry) line.geometry.dispose();
if (line.material) line.material.dispose();
```

---

## まとめ

### 重要なポイント

1. **座標変換**: `start_point_depth`は天端の深さ（正の値）、Three.jsでは負の値に変換
2. **交点計算**: パラメトリック方程式を使用して正確な交点を求める
3. **チェック機能**: 断面平面との距離、管路の範囲内などをチェックして不要な描画を防ぐ
4. **メモリ管理**: dispose()を確実に呼んでメモリリークを防ぐ
5. **CSG**: 正確な断面形状を得るために論理演算を使用

### 関連ファイル

- `Scene3D.js`: CrossSectionPlaneを使用する親コンポーネント
- `CrossSectionView.js`: 断面ビューのUI
- `DistanceMeasurement.js`: 距離測定機能（ラベル表示の参考）

---

**作成日**: 2025年10月30日  
**バージョン**: 1.0

