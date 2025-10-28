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
    
    // 切り口の表示状態（デフォルトは非表示）
    this.showCrossSections = false;
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
   * 線の位置はクリックしたX,Z座標を通り、深さは管路の中心深さを使用
   * @param {THREE.Object3D} pipeObject - クリックされた管路オブジェクト
   * @param {THREE.Vector3} clickPoint - クリックした位置の3D座標（X,Z座標を使用）
   */
  drawClickedPipeCrossSection(pipeObject, clickPoint) {
    const objectData = pipeObject.userData.objectData;
    const geometry = objectData.geometry?.[0];
    
    if (!geometry || !geometry.vertices || geometry.vertices.length < 2) {
      return;
    }
    
    // 管路の形状とサイズを取得
    let radius = (objectData.attributes?.radius != null) ? Number(objectData.attributes.radius) : 0.3;
    if (radius > 5) radius = radius / 1000;
    radius = Math.max(radius, 0.05);
    
    // 管路の実際の3D位置を使用（断面描画用）
    const center = pipeObject.position.clone();
    
    // 管路の中心線を取得
    const vertices = geometry.vertices;
    
    // 管路の中心軸方向ベクトルを計算
    const startVertex = vertices[0];
    const endVertex = vertices[vertices.length - 1];
    
    // 深さ属性の有無をチェック（Scene3D.jsと同じロジック）
    const hasDepthAttrs = (
      objectData.attributes &&
      objectData.attributes.start_point_depth != null &&
      objectData.attributes.end_point_depth != null &&
      Number.isFinite(Number(objectData.attributes.start_point_depth)) &&
      Number.isFinite(Number(objectData.attributes.end_point_depth))
    );
    
    // 座標変換（他の管路と同じロジック）
    let start, end;
    if (hasDepthAttrs) {
      const startDepth = Number(objectData.attributes.start_point_depth / 100);
      const endDepth = Number(objectData.attributes.end_point_depth / 100);
      const startCenterY = startDepth > 0 ? -(startDepth - radius): startDepth;
      const endCenterY = endDepth > 0 ? -(endDepth - radius): endDepth;
      start = new THREE.Vector3(startVertex[1], startCenterY, startVertex[0]);
      end = new THREE.Vector3(endVertex[1], endCenterY, endVertex[0]);
    } else {
      start = new THREE.Vector3(startVertex[1], startVertex[2] - radius, startVertex[0]);
      end = new THREE.Vector3(endVertex[1], endVertex[2] - radius, endVertex[0]);
    }
    
    // 管路の中心軸方向ベクトル
    const axisDirection = new THREE.Vector3().subVectors(end, start).normalize();
    
    // Y座標（深さ）- 管路の中心深さを使用
    const pipeDepth = center.y; // 管路の中心深さ
    const maxDepth = -50; // 最大深さ（50m）
    
    // クリック位置のX,Z座標を使用するためのVector3を作成
    const linePosition = new THREE.Vector3(clickPoint.x, 0, clickPoint.z);
    
    // 床（Y=0）から-50mまで1mごとに線を描画
    for (let depth = 0; depth >= maxDepth; depth -= 1) {
      // 1m間隔のグリッド線（灰色）
      this.drawEastWestLine(depth, linePosition, 0x888888, false);
      
      // このグリッド線が管路を切っている位置に縦線を描画
      this.drawVerticalLinesAtDepth(depth);
    }
    
    // 管路の中心深さに赤い線を追加（強調表示、ラベルなし）
    this.drawEastWestLine(pipeDepth, linePosition, 0xff0000, true, false);
    
    // クリックした管路に縦線を描画（管路の色で）+ ラベルもグループ化
    this.drawVerticalLine(linePosition, pipeDepth, pipeObject.material.color);
    
    // 断面平面（クリック位置のZ座標）と管路が交差する位置に縦線を描画
    // （クリックした管路は既に描画済みなのでスキップ）
    this.drawVerticalLinesAtCrossSectionPlane(clickPoint.z, pipeObject);
    
    // 管路の断面（円形）を描画（管路の中心位置で）
    this.drawCrossSectionCircle(center, radius, axisDirection, pipeObject.material.color);
    
    console.log(`クリックした位置に東西方向の線を描画しました（クリック位置: X=${clickPoint.x.toFixed(2)}, Z=${clickPoint.z.toFixed(2)}, 管路中心深さ: ${pipeDepth.toFixed(2)}m）`);
  }

  /**
   * 断面平面（Z座標固定）が管路を切っている位置に縦線を描画
   * @param {number} crossSectionZ - 断面平面のZ座標
   * @param {THREE.Object3D} excludePipeObject - スキップする管路（クリックした管路）
   */
  drawVerticalLinesAtCrossSectionPlane(crossSectionZ, excludePipeObject = null) {
    if (!this.objectsRef || !this.objectsRef.current) {
      return;
    }
    
    const allObjects = Object.values(this.objectsRef.current);
    
    allObjects.forEach(obj => {
      // クリックした管路はスキップ（既に描画済み）
      if (excludePipeObject && obj === excludePipeObject) {
        return;
      }
      
      if (obj && obj.userData && obj.userData.objectData) {
        const objectData = obj.userData.objectData;
        const geometry = objectData.geometry?.[0];
        
        if (!geometry || !geometry.vertices || geometry.vertices.length < 2) {
          return;
        }
        
        // 管路の半径を取得（Scene3D.jsと同じロジック）
        let radius = (objectData.attributes?.radius != null) ? Number(objectData.attributes.radius) : 0.3;
        if (radius > 5) radius = radius / 1000;
        radius = Math.max(radius, 0.05);
        
        // 管路の始点と終点を取得
        const vertices = geometry.vertices;
        const startVertex = vertices[0];
        const endVertex = vertices[vertices.length - 1];
        
        // 深さ属性の有無をチェック（Scene3D.jsと同じロジック）
        const hasDepthAttrs = (
          objectData.attributes &&
          objectData.attributes.start_point_depth != null &&
          objectData.attributes.end_point_depth != null &&
          Number.isFinite(Number(objectData.attributes.start_point_depth)) &&
          Number.isFinite(Number(objectData.attributes.end_point_depth))
        );
        
        let start, end;
        if (hasDepthAttrs) {
          const startDepth = Number(objectData.attributes.start_point_depth / 100);
          const endDepth = Number(objectData.attributes.end_point_depth / 100);
          const startCenterY = startDepth > 0 ? -(startDepth - radius): startDepth;
          const endCenterY = endDepth > 0 ? -(endDepth - radius): endDepth;
          start = new THREE.Vector3(startVertex[1], startCenterY, startVertex[0]);
          end = new THREE.Vector3(endVertex[1], endCenterY, endVertex[0]);
        } else {
          start = new THREE.Vector3(startVertex[1], startVertex[2] - radius, startVertex[0]);
          end = new THREE.Vector3(endVertex[1], endVertex[2] - radius, endVertex[0]);
        }
        
        // 管路の前後端のZ座標（半径を考慮）
        const minZ = Math.min(start.z, end.z) - radius;
        const maxZ = Math.max(start.z, end.z) + radius;
        
        // 断面平面が管路を切っているかチェック
        if (crossSectionZ >= minZ && crossSectionZ <= maxZ) {
          // 管路の中心軸と断面平面（Z=crossSectionZ）の交点を計算
          const direction = new THREE.Vector3().subVectors(end, start);
          
          // パラメトリック方程式: P = start + t * direction
          // Z座標がcrossSectionZになるtを求める
          if (Math.abs(direction.z) > 0.001) {
            const t = (crossSectionZ - start.z) / direction.z;
            
            // t が 0〜1 の範囲にあれば、管路の中心軸上
            if (t >= 0 && t <= 1) {
              const intersectionPoint = start.clone().add(direction.clone().multiplyScalar(t));
              
              // 交差点の位置に縦線とラベルを描画
              const pipePosition = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);
              this.drawVerticalLine(pipePosition, intersectionPoint.y, obj.material.color);
              
              // この位置で管路の切り口（円形）も描画
              const axisDirection = direction.clone().normalize();
              this.drawCrossSectionCircle(intersectionPoint, radius, axisDirection, obj.material.color);
            }
          }
        }
      }
    });
  }

  /**
   * グリッド線が管路を切っている位置に縦線を描画
   * @param {number} targetDepth - グリッド線の深さ（Y座標）
   */
  drawVerticalLinesAtDepth(targetDepth) {
    if (!this.objectsRef || !this.objectsRef.current) {
      return;
    }
    
    const allObjects = Object.values(this.objectsRef.current);
    
    allObjects.forEach(obj => {
      if (obj && obj.userData && obj.userData.objectData) {
        const objectData = obj.userData.objectData;
        const geometry = objectData.geometry?.[0];
        
        if (!geometry || !geometry.vertices || geometry.vertices.length < 2) {
          return;
        }
        
        // 管路の半径を取得（Scene3D.jsと同じロジック）
        let radius = (objectData.attributes?.radius != null) ? Number(objectData.attributes.radius) : 0.3;
        if (radius > 5) radius = radius / 1000;
        radius = Math.max(radius, 0.05);
        
        // 管路の始点と終点を取得
        const vertices = geometry.vertices;
        const startVertex = vertices[0];
        const endVertex = vertices[vertices.length - 1];
        
        // 深さ属性の有無をチェック（Scene3D.jsと同じロジック）
        const hasDepthAttrs = (
          objectData.attributes &&
          objectData.attributes.start_point_depth != null &&
          objectData.attributes.end_point_depth != null &&
          Number.isFinite(Number(objectData.attributes.start_point_depth)) &&
          Number.isFinite(Number(objectData.attributes.end_point_depth))
        );
        
        let start, end;
        if (hasDepthAttrs) {
          const startDepth = Number(objectData.attributes.start_point_depth / 100);
          const endDepth = Number(objectData.attributes.end_point_depth / 100);
          const startCenterY = startDepth > 0 ? -(startDepth - radius): startDepth;
          const endCenterY = endDepth > 0 ? -(endDepth - radius): endDepth;
          start = new THREE.Vector3(startVertex[1], startCenterY, startVertex[0]);
          end = new THREE.Vector3(endVertex[1], endCenterY, endVertex[0]);
        } else {
          start = new THREE.Vector3(startVertex[1], startVertex[2] - radius, startVertex[0]);
          end = new THREE.Vector3(endVertex[1], endVertex[2] - radius, endVertex[0]);
        }
        
        // 管路の上端と下端のY座標（startとendはすでに中心位置なので半径を加減）
        const minY = Math.min(start.y, end.y) - radius;
        const maxY = Math.max(start.y, end.y) + radius;
        
        // グリッド線が管路を切っているかチェック
        if (targetDepth >= minY && targetDepth <= maxY) {
          // 管路の中心軸とグリッド線（Y=targetDepth）の交点を計算
          const direction = new THREE.Vector3().subVectors(end, start);
          
          // パラメトリック方程式: P = start + t * direction
          // Y座標がtargetDepthになるtを求める
          if (Math.abs(direction.y) > 0.001) {
            const t = (targetDepth - start.y) / direction.y;
            
            // t が 0〜1 の範囲にあれば、管路の中心軸上
            if (t >= 0 && t <= 1) {
              const intersectionPoint = start.clone().add(direction.clone().multiplyScalar(t));
              
              // 交差点の位置に縦線とラベルを描画
              const pipePosition = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);
              this.drawVerticalLine(pipePosition, targetDepth, obj.material.color);
              
              // この位置で管路の切り口（円形）も描画
              const axisDirection = direction.clone().normalize();
              this.drawCrossSectionCircle(intersectionPoint, radius, axisDirection, obj.material.color);
            }
          }
        }
      }
    });
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
   * @param {boolean} showLabel - ラベルを表示するか（デフォルトはtrue）
   */
  drawEastWestLine(depth, center, color, highlight = false, showLabel = true) {
    const lineLength = 1000;
    
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
    
    // 深さラベルを追加（10mごと、または強調表示の場合、かつshowLabel=trueの場合）
    const shouldShowLabel = showLabel && (highlight || (Math.abs(depth) % 10 === 0));
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
   * 縦線を描画（床から管路まで）+ ラベルをグループ化
   * @param {THREE.Vector3} position - 線の位置（X,Z座標）
   * @param {number} pipeDepth - 管路の中心深さ（Y座標）
   * @param {THREE.Color} color - 線の色（管路の色）
   * @returns {THREE.Group} - 縦線とラベルを含むグループ
   */
  drawVerticalLine(position, pipeDepth, color) {
    // グループを作成（縦線とラベルを一緒に管理）
    const lineGroup = new THREE.Group();
    
    // グループ全体の位置を設定
    lineGroup.position.set(position.x, 0, position.z);
    
    // 床（Y=0）から管路の中心深さまでの縦線（グループ内の相対座標）
    const startPoint = new THREE.Vector3(0, 0, 0); // グループの原点から
    const endPoint = new THREE.Vector3(0, pipeDepth, 0); // Y軸方向にpipeDepthまで
    
    const points = [startPoint, endPoint];
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    
    // 管路の色を使用
    const lineMaterial = new THREE.LineBasicMaterial({
      color: color,
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });
    
    const line = new THREE.Line(lineGeometry, lineMaterial);
    lineGroup.add(line); // グループに線を追加
    
    // 縦線の中点にラベルを作成（グループ内の相対座標）
    const labelY = (0 + pipeDepth) / 2;
    const labelSprite = this.createDepthLabelSprite(pipeDepth, 0xff0000);
    labelSprite.position.set(0, labelY, 0); // グループの原点から相対的な位置
    lineGroup.add(labelSprite); // グループにラベルを追加
    
    this.depthLines.push(lineGroup);
    this.depthLabels.push(labelSprite); // ラベルの参照も保持
    this.scene.add(lineGroup);
    
    return lineGroup;
  }

  /**
   * 深さラベルのSpriteを作成（シーンに追加しない）
   * @param {number} depth - 深さ（Y座標）
   * @param {number} color - ラベルの色（16進数、デフォルトは白）
   * @returns {THREE.Sprite} - 作成されたSprite
   */
  createDepthLabelSprite(depth, color = 0xffffff) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    // 16進数の色をCSS形式に変換
    const cssColor = '#' + color.toString(16).padStart(6, '0');
    context.fillStyle = cssColor;
    context.font = '32px Arial';
    context.textAlign = 'center'; // テキストを中央寄せ
    context.fillText(`${depth.toFixed(2)}m`, canvas.width / 2, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(4, 1, 1);
    
    return sprite;
  }

  /**
   * 深さラベルを描画
   * @param {number} depth - 深さ（Y座標）
   * @param {THREE.Vector3} position - ラベル位置
   * @param {number} color - ラベルの色（16進数、デフォルトは白）
   * @param {number} xOffset - X座標のオフセット（デフォルトは-5、横線用）
   */
  drawDepthLabel(depth, position, color = 0xffffff, xOffset = -5) {
    const sprite = this.createDepthLabelSprite(depth, color);
    sprite.position.set(position.x + xOffset, position.y, position.z);
    
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
    
    // 表示状態を設定（デフォルトは非表示）
    circleMesh.visible = this.showCrossSections;
    
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
   * 切り口の表示/非表示を切り替え
   * @param {boolean} show - 表示するかどうか
   */
  toggleCrossSections(show) {
    this.showCrossSections = show;
    
    // 既存の切り口の表示を切り替え
    this.crossSections.forEach(crossSection => {
      crossSection.visible = show;
    });
    
    console.log(`切り口を${show ? '表示' : '非表示'}にしました（切り口の数: ${this.crossSections.length}）`);
  }

  /**
   * クリーンアップ
   */
  dispose() {
    this.clear();
  }
}

export default CrossSectionPlane;
