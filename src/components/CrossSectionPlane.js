import * as THREE from 'three';

/**
 * 断面平面コンポーネント
 * - 管路をクリックして各管路の深さ位置に水平線を表示
 * - 各管路の断面（切り口）を描画
 */
class CrossSectionPlane {
  constructor(scene, camera, objectsRef) {
    this.scene = scene;
    this.camera = camera;
    this.objectsRef = objectsRef;
    
    // 描画オブジェクト
    this.depthLines = []; // 各管路の深さ位置の水平線
    this.crossSections = []; // 管路の断面（切り口）
    this.depthLabels = []; // 深さラベル
  }

  /**
   * 管路をクリックして断面を生成
   * @param {THREE.Object3D} pipeObject - クリックされた管路オブジェクト
   * @param {THREE.Vector3} clickPoint - クリックした位置の3D座標
   */
  createCrossSection(pipeObject, clickPoint) {
    // 既存の断面をクリア
    this.clear();
    
    if (!pipeObject || !pipeObject.userData || !pipeObject.userData.objectData) {
      console.warn('無効な管路オブジェクト');
      return;
    }
    
    console.log('断面生成を開始します - クリックした管路のみ', 'クリック位置:', clickPoint);
    
    // クリックした管路のみに東西方向の線を描画
    this.drawClickedPipeCrossSection(pipeObject, clickPoint);
  }

  /**
   * クリックした管路に東西方向の線を描画
   * @param {THREE.Object3D} pipeObject - クリックされた管路オブジェクト
   * @param {THREE.Vector3} clickPoint - クリックした位置の3D座標
   */
  drawClickedPipeCrossSection(pipeObject, clickPoint) {
    const objectData = pipeObject.userData.objectData;
    const geometry = objectData.geometry?.[0];
    
    if (!geometry || !geometry.vertices || geometry.vertices.length < 2) {
      return;
    }
    
    // 管路の形状とサイズを取得
    const radius = (geometry.radius || 0.3) / 2; // 半径（メートル）
    
    // 管路の実際の3D位置を使用（断面描画用）
    const center = pipeObject.position.clone();
    
    // 管路の中心線を取得
    const vertices = geometry.vertices;
    
    // 管路の中心軸方向ベクトルを計算
    const startVertex = vertices[0];
    const endVertex = vertices[vertices.length - 1];
    
    // Three.js座標系に変換
    const start = new THREE.Vector3(startVertex[0], -startVertex[2], startVertex[1]);
    const end = new THREE.Vector3(endVertex[0], -endVertex[2], endVertex[1]);
    
    // 管路の中心軸方向ベクトル
    const axisDirection = new THREE.Vector3().subVectors(end, start).normalize();
    
    // Y座標（深さ）- クリック位置を使用
    const clickDepth = clickPoint.y;
    const pipeDepth = center.y; // 管路の中心深さ（参考用）
    
    // 床（Y=0）からクリックした位置まで2mごとに線を描画
    // クリック位置が地下にある場合（Y < 0）
    if (clickDepth < 0) {
      // 0m（地表）からクリック位置の深さまで2mごと（グリッド線）
      for (let depth = 0; depth >= clickDepth; depth -= 2) {
        // クリック位置の深さを超えたらループを終了
        if (depth < clickDepth) {
          break;
        }
        
        // 2m間隔のグリッド線（灰色）
        this.drawEastWestLine(depth, clickPoint, 0x888888, false);
      }
      
      // クリックした位置の正確な深さに赤い線を追加（強調表示）
      this.drawEastWestLine(clickDepth, clickPoint, 0xff0000, true);
    } else {
      // クリック位置が地上にある場合は、その位置に赤い線を1本描画
      this.drawEastWestLine(clickDepth, clickPoint, 0xff0000, true);
    }
    
    // 管路の断面（円形）を描画（管路の中心位置で）
    this.drawCrossSectionCircle(center, radius, axisDirection, pipeObject.material.color);
    
    console.log(`クリックした位置に東西方向の線を描画しました（クリック深さ: ${clickDepth.toFixed(2)}m, 管路中心深さ: ${pipeDepth.toFixed(2)}m）`);
  }

  /**
   * すべての管路の断面を描画
   */
  drawAllPipeCrossSections() {
    if (!this.objectsRef || !this.objectsRef.current) {
      console.warn('管路オブジェクトが見つかりません');
      return;
    }
    
    const objects = Object.values(this.objectsRef.current);
    
    objects.forEach(obj => {
      if (obj && obj.userData && obj.userData.objectData) {
        this.drawPipeCrossSection(obj);
      }
    });
    
    console.log(`${this.crossSections.length}個の管路断面を描画しました`);
  }

  /**
   * 単一の管路の断面を描画
   */
  drawPipeCrossSection(pipeObject) {
    const objectData = pipeObject.userData.objectData;
    const geometry = objectData.geometry?.[0];
    
    if (!geometry || !geometry.vertices || geometry.vertices.length < 2) {
      return;
    }
    
    // 管路の形状とサイズを取得
    const shapeType = geometry.type || 0; // 0: 円形, 1: 矩形
    const radius = (geometry.radius || 0.3) / 2; // 半径（メートル）
    
    // 管路の実際の3D位置を使用（Scene3D.jsで設定された位置）
    const center = pipeObject.position.clone();
    
    // 管路の中心線を取得
    const vertices = geometry.vertices;
    
    // 管路の中心軸方向ベクトルを計算（最初と最後の頂点）
    const startVertex = vertices[0];
    const endVertex = vertices[vertices.length - 1];
    
    // Three.js座標系に変換
    const start = new THREE.Vector3(startVertex[0], -startVertex[2], startVertex[1]);
    const end = new THREE.Vector3(endVertex[0], -endVertex[2], endVertex[1]);
    
    // 管路の中心軸方向ベクトル
    const axisDirection = new THREE.Vector3().subVectors(end, start).normalize();
    
    // Y座標（深さ）- 実際のオブジェクトの位置を使用
    const depth = center.y;
    
    // この深さ位置に水平線を描画（管路の軸に垂直）
    this.drawDepthLine(depth, center, axisDirection, pipeObject.material.color);
    
    // 管路の断面（円形）を描画
    this.drawCrossSectionCircle(center, radius, axisDirection, pipeObject.material.color);
  }

  /**
   * 東西方向（X軸方向）の線を描画
   * @param {number} depth - 深さ（Y座標）
   * @param {THREE.Vector3} center - 中心位置
   * @param {number} color - 線の色（16進数）
   * @param {boolean} highlight - 強調表示するか（trueの場合、太く不透明にする）
   */
  drawEastWestLine(depth, center, color, highlight = false) {
    const lineLength = 200;
    
    // X軸方向（東西方向）の線
    const startPoint = new THREE.Vector3(center.x - lineLength / 2, depth, center.z);
    const endPoint = new THREE.Vector3(center.x + lineLength / 2, depth, center.z);
    
    const points = [startPoint, endPoint];
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: color,
      linewidth: highlight ? 4 : 2,
      transparent: !highlight,
      opacity: highlight ? 1.0 : 0.6
    });
    
    const line = new THREE.Line(lineGeometry, lineMaterial);
    this.depthLines.push(line);
    this.scene.add(line);
    
    // 深さラベルを追加（10mごと、または強調表示の場合）
    const shouldShowLabel = highlight || (Math.abs(depth) % 10 === 0);
    if (shouldShowLabel) {
      const labelPosition = new THREE.Vector3(center.x, depth, center.z);
      this.drawDepthLabel(depth, labelPosition, highlight ? color : 0xffffff);
    }
  }

  /**
   * 指定した深さに水平線を描画（管路の軸に垂直）
   */
  drawDepthLine(depth, center, axisDirection, color) {
    const lineLength = 200;
    
    // 管路の軸方向に垂直な方向ベクトルを計算
    // Y軸（上下方向）との外積で水平面内の垂直方向を得る
    const yAxis = new THREE.Vector3(0, 1, 0);
    let perpendicular = new THREE.Vector3().crossVectors(axisDirection, yAxis);
    
    // もし管路がY軸と平行な場合は、X軸を使用
    if (perpendicular.length() < 0.001) {
      const xAxis = new THREE.Vector3(1, 0, 0);
      perpendicular.crossVectors(axisDirection, xAxis);
    }
    
    perpendicular.normalize();
    
    // 管路の中心を通り、軸に垂直な線を描画
    const startPoint = new THREE.Vector3().addVectors(
      center,
      perpendicular.clone().multiplyScalar(-lineLength / 2)
    );
    const endPoint = new THREE.Vector3().addVectors(
      center,
      perpendicular.clone().multiplyScalar(lineLength / 2)
    );
    
    // Y座標を固定（水平線にする）
    startPoint.y = depth;
    endPoint.y = depth;
    
    const points = [startPoint, endPoint];
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x888888,
      linewidth: 2,
      transparent: true,
      opacity: 0.6
    });
    
    const line = new THREE.Line(lineGeometry, lineMaterial);
    this.depthLines.push(line);
    this.scene.add(line);
    
    // 深さラベルを追加（10mごとのみ）
    if (Math.abs(depth) % 10 === 0) {
      this.drawDepthLabel(depth, startPoint);
    }
  }

  /**
   * 深さラベルを描画
   * @param {number} depth - 深さ（Y座標）
   * @param {THREE.Vector3} position - ラベル位置
   * @param {number} color - ラベルの色（16進数、デフォルトは白）
   */
  drawDepthLabel(depth, position, color = 0xffffff) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    // 16進数の色をCSS形式に変換
    const cssColor = '#' + color.toString(16).padStart(6, '0');
    context.fillStyle = cssColor;
    context.font = '32px Arial';
    context.fillText(`${depth.toFixed(2)}m`, 10, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.set(position.x - 5, position.y, position.z);
    sprite.scale.set(4, 1, 1);
    
    this.depthLabels.push(sprite);
    this.scene.add(sprite);
  }

  /**
   * 管路の断面（円形）を描画
   */
  drawCrossSectionCircle(center, radius, axisDirection, color) {
    // NaNチェック
    if (isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
      console.warn('断面の中心座標にNaNが含まれています', center);
      return;
    }
    
    if (isNaN(radius) || radius <= 0) {
      console.warn('断面の半径が不正です', radius);
      return;
    }
    
    // 円形の断面
    const circleGeometry = new THREE.CircleGeometry(radius, 32);
    const circleMaterial = new THREE.MeshBasicMaterial({
      color: color || 0x00ff00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    
    const circleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
    circleMesh.position.copy(center);
    
    // 管路の軸方向に向ける
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisDirection);
    circleMesh.setRotationFromQuaternion(quaternion);
    
    // 輪郭線を追加
    const edgesGeometry = new THREE.EdgesGeometry(circleGeometry);
    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    circleMesh.add(edges);
    
    this.crossSections.push(circleMesh);
    this.scene.add(circleMesh);
  }

  /**
   * 断面をクリア
   */
  clear() {
    // 深さ線を削除
    this.depthLines.forEach(line => {
      this.scene.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    });
    this.depthLines = [];
    
    // 深さラベルを削除
    this.depthLabels.forEach(sprite => {
      this.scene.remove(sprite);
      if (sprite.material) {
        if (sprite.material.map) sprite.material.map.dispose();
        sprite.material.dispose();
      }
    });
    this.depthLabels = [];
    
    // 断面形状を削除
    this.crossSections.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      
      // 子要素（輪郭線）も削除
      mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    this.crossSections = [];
  }

  /**
   * クリーンアップ
   */
  dispose() {
    this.clear();
  }
}

export default CrossSectionPlane;
