import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { CSG } from 'three-csg-ts';

/**
 * 断面平面コンポーネント
 * - 管路をクリックして各管路の深さ位置に水平線を表示
 * - 各管路の断面（切り口）を描画
 * - CSGを使用して垂直面で切断した断面を表示
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
    this.depthLabelPositions = []; // 深さラベルの位置（スケール調整用）
    
    // 切り口の表示状態（デフォルトは非表示）
    this.showCrossSections = false;
    
    // 断面描画情報を一時的に保存する配列
    this.pendingCrossSections = []; // {center, radius, axisDirection, color, pipeObject, crossSectionZ}
    
    // グリッド線の角度（度、デフォルト: 0）
    this.gridAngle = 0;
    // グリッド線の中心点（縦線の配置基準）
    this.gridCenter = null;
  }

  /**
   * 管路をクリックして断面を生成
   * @param {THREE.Object3D} pipeObject - クリックされた管路オブジェクト
   * @param {THREE.Vector3} clickPoint - クリックした位置の3D座標
   * @param {number} gridAngle - グリッド線の方向を変える角度（度、デフォルト: 0）
   */
  createCrossSection(pipeObject, clickPoint, gridAngle = 0) {
    // 生成前に既存の表示を全クリア
    this.clear();
    
    this.pendingCrossSections = [];
    this.gridAngle = gridAngle || 0; // グリッド線の角度を保存
    
    if (!pipeObject || !pipeObject.userData || !pipeObject.userData.objectData) {
      return;
    }
    
    // クリックした管路を基準に断面生成フローを開始
    this.drawClickedPipeCrossSection(pipeObject, clickPoint);
  }

  /**
   * クリックした管路に東西方向の線を描画
   * 線の位置は断面平面と管路中心線の交点を通り、縦線は管路の最も高い位置（浅い位置）まで描画
   * @param {THREE.Object3D} pipeObject - クリックされた管路オブジェクト
   * @param {THREE.Vector3} clickPoint - クリックした位置の3D座標（Z座標から断面平面を定義）
   */
  drawClickedPipeCrossSection(pipeObject, clickPoint) {
    // クリック対象の管路情報を取得
    const objectData = pipeObject.userData.objectData;
    const geometry = objectData.geometry?.[0];
    
    if (!geometry || !geometry.vertices || geometry.vertices.length < 2) {
      return;
    }
    
    const radius = this.getPipeRadius(objectData);
    const vertices = geometry.vertices;
    const { start, end } = this.getPipeStartEnd(vertices[0], vertices[vertices.length - 1], objectData, radius);
    
    const direction = new THREE.Vector3().subVectors(end, start);
    const axisDirection = direction.clone().normalize(); // 管路の軸方向
    
    // 断面平面(Z=clickPoint.z)と管路中心線の交点を求める
    let intersectionPoint;
    if (Math.abs(direction.z) > 0.001) {
      const t = (clickPoint.z - start.z) / direction.z;
      intersectionPoint = start.clone().add(direction.clone().multiplyScalar(t));
    } else {
      intersectionPoint = start.clone();
      intersectionPoint.z = clickPoint.z;
    }
    
    const maxDepth = -50; // グリッド描画の下限(m)
    const linePosition = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);
    
    // グリッド線の中心点を保存（縦線の配置基準として使用）
    this.gridCenter = linePosition.clone();
    
    for (let depth = 0; depth >= maxDepth; depth -= 1) {
      this.drawEastWestLine(depth, linePosition, 0x888888, false);
    }
    
    // 断面平面Z上で交差するすべての管路に縦線を描画
    this.drawVerticalLinesAtCrossSectionPlane(clickPoint.z, null);
    
    // 後段の一括描画用に断面情報を登録
    this.pendingCrossSections.push({
      center: intersectionPoint,
      radius: radius,
      axisDirection: axisDirection,
      color: pipeObject.material.color,
      pipeObject: pipeObject,
      crossSectionZ: clickPoint.z
    });
    
    this.drawAllPendingCrossSections();
  }

  /**
   * 断面平面（Z座標固定）が管路を切っている位置に縦線を描画
   * @param {number} crossSectionZ - 断面平面のZ座標
   * @param {THREE.Object3D} excludePipeObject - スキップする管路（クリックした管路）
   */
  drawVerticalLinesAtCrossSectionPlane(crossSectionZ, excludePipeObject = null) {
    // 断面平面Zで各管路の中心線と交差する位置を探し、縦線を描画
    if (!this.objectsRef || !this.objectsRef.current) {
      return;
    }
    
    // グリッド線の角度を取得
    const gridAngle = this.gridAngle || 0;
    const angleRad = THREE.MathUtils.degToRad(gridAngle);
    
    // グリッド線に垂直な方向ベクトル（縦線を配置する方向）
    const perpendicularDirection = new THREE.Vector3(
      -Math.sin(angleRad),
      0,
      Math.cos(angleRad)
    ).normalize();
    
    const allObjects = Object.values(this.objectsRef.current);
    
    allObjects.forEach(obj => {
      if (excludePipeObject && obj === excludePipeObject) {
        return;
      }
      
      if (obj && obj.userData && obj.userData.objectData) {
        const objectData = obj.userData.objectData;
        const geometry = objectData.geometry?.[0];
        
        if (!geometry || !geometry.vertices || geometry.vertices.length < 2) {
          return;
        }
        
        const radius = this.getPipeRadius(objectData);
        const vertices = geometry.vertices;
        const { start, end } = this.getPipeStartEnd(vertices[0], vertices[vertices.length - 1], objectData, radius);
        
        const minZ = Math.min(start.z, end.z) - radius;
        const maxZ = Math.max(start.z, end.z) + radius;
        
        if (crossSectionZ >= minZ && crossSectionZ <= maxZ) {
          const direction = new THREE.Vector3().subVectors(end, start);
          
          if (Math.abs(direction.z) > 0.001) {
            const t = (crossSectionZ - start.z) / direction.z;
            
            if (t >= 0 && t <= 1) {
              const intersectionPoint = start.clone().add(direction.clone().multiplyScalar(t));
              
              // グリッド線と交差する位置に縦線を配置
              // 管路の位置から、グリッド線に垂直な方向に投影して縦線の位置を決定
              if (!this.gridCenter) {
                // gridCenterが設定されていない場合は、管路の位置をそのまま使用
                const pipePosition = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);
                this.drawVerticalLine(pipePosition, intersectionPoint.y, obj.material.color, radius);
              } else {
                // 管路の位置（X, Z座標、Y=0）
                const pipePos2D = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);
                
                // グリッド線の中心点から管路へのベクトル
                const toPipe = pipePos2D.clone().sub(this.gridCenter);
                
                // このベクトルをグリッド線に垂直な方向に投影
                // 投影した距離だけ、管路の位置からグリッド線に垂直な方向に移動した位置が縦線の位置
                const perpendicularProjection = toPipe.dot(perpendicularDirection);
                const pipePosition = this.gridCenter.clone().add(perpendicularDirection.clone().multiplyScalar(perpendicularProjection));
                pipePosition.y = 0; // Y座標は0（床の位置）
                
                // 床(Y=0)から管路上端までの縦線を描画
                this.drawVerticalLine(pipePosition, intersectionPoint.y, obj.material.color, radius);
              }
              
              this.pendingCrossSections.push({
                center: intersectionPoint,
                radius: radius,
                axisDirection: direction.clone().normalize(),
                color: obj.material.color,
                pipeObject: obj,
                crossSectionZ: crossSectionZ
              });
            }
          }
        }
      }
    });
  }

  /**
   * 東西方向（X軸方向）の線を描画（角度に応じて回転）
   * @param {number} depth - 深さ（Y座標）
   * @param {THREE.Vector3} center - 中心位置
   * @param {number} color - 線の色（16進数）
   * @param {boolean} highlight - 強調表示するか
   * @param {boolean} showLabel - ラベルを表示するか
   */
  drawEastWestLine(depth, center, color, highlight = false, showLabel = true) {
    // グリッド線の角度（度からラジアンに変換）
    const gridAngle = this.gridAngle || 0;
    const angleRad = THREE.MathUtils.degToRad(gridAngle);
    
    // 水平方向(X軸)の基準グリッド線の長さ
    const lineLength = 1000;
    
    // 角度に応じて線の方向を回転
    const direction = new THREE.Vector3(
      Math.cos(angleRad),
      0,
      Math.sin(angleRad)
    ).normalize();
    
    // 中心点から両方向に線を延ばす
    const halfLength = lineLength / 2;
    const startPoint = center.clone().add(direction.clone().multiplyScalar(-halfLength));
    const endPoint = center.clone().add(direction.clone().multiplyScalar(halfLength));
    
    // Y座標をdepthに設定（gridAngle追加時に失われた処理を復元）
    startPoint.y = depth;
    endPoint.y = depth;
    
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions([
      startPoint.x, startPoint.y, startPoint.z,
      endPoint.x, endPoint.y, endPoint.z
    ]);
    
    const lineMaterial = new LineMaterial({
      color: color,
      linewidth: highlight ? 5 : 2,
      transparent: !highlight,
      opacity: highlight ? 1.0 : 0.6,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      worldUnits: false,
      vertexColors: false,
      dashed: false
    });
    
    const line = new Line2(lineGeometry, lineMaterial);
    line.computeLineDistances();
    this.depthLines.push(line);
    this.scene.add(line);
    
    const shouldShowLabel = showLabel && (highlight || (Math.abs(depth) % 10 === 0));
    if (shouldShowLabel) {
      const labelPosition = new THREE.Vector3(center.x, depth, center.z);
      this.drawDepthLabel(depth, labelPosition, highlight ? color : 0xffffff);
    }
  }

  /**
   * 縦線を描画（床から管路の上端まで）+ ラベルをグループ化
   * @param {THREE.Vector3} position - 線の位置（X,Z座標）
   * @param {number} pipeDepth - 管路の中心深さ（Y座標）
   * @param {THREE.Color} color - 線の色（管路の色）
   * @param {number} radius - 管路の半径
   * @returns {THREE.Group} - 縦線とラベルを含むグループ
   */
  drawVerticalLine(position, pipeDepth, color, radius = 0) {
    // 単一の縦線(床→管路上端)と深さラベルをまとめて描画
    const lineGroup = new THREE.Group();
    lineGroup.position.set(position.x, 0, position.z);
    
    const pipeTopY = pipeDepth + radius;
    const startPoint = new THREE.Vector3(0, 0, 0);
    const endPoint = new THREE.Vector3(0, pipeTopY, 0);
    
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions([
      startPoint.x, startPoint.y, startPoint.z,
      endPoint.x, endPoint.y, endPoint.z
    ]);
    
    const lineMaterial = new LineMaterial({
      color: color,
      linewidth: 3,
      transparent: true,
      opacity: 0.8,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      worldUnits: false,
      vertexColors: false,
      dashed: false
    });
    
    const line = new Line2(lineGeometry, lineMaterial);
    line.computeLineDistances();
    lineGroup.add(line);
    
    const labelY = pipeTopY / 2;
    const labelSprite = this.createDepthLabelSprite(pipeTopY);
    labelSprite.position.set(0, labelY, 0);
    lineGroup.add(labelSprite);
    
    const labelWorldPosition = new THREE.Vector3(position.x, labelY, position.z);
    
    this.depthLines.push(lineGroup);
    this.depthLabels.push(labelSprite);
    this.depthLabelPositions.push(labelWorldPosition);
    this.scene.add(lineGroup);
    
    return lineGroup;
  }

  /**
   * 深さラベルのSpriteを作成（シーンに追加しない）
   * @param {number} depth - 深さ（Y座標）
   * @returns {THREE.Sprite} - 作成されたSprite
   */
  createDepthLabelSprite(depth) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 1024;
    canvas.height = 256;
    
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.shadowColor = 'rgba(0, 0, 0, 0.9)';
    context.shadowBlur = 12;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;
    context.fillStyle = 'white';
    context.font = 'Bold 120px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${Math.abs(depth).toFixed(3)}m`, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.5, 1);
    
    return sprite;
  }

  /**
   * 深さラベルを描画
   * @param {number} depth - 深さ（Y座標）
   * @param {THREE.Vector3} position - ラベル位置
   * @param {number} color - ラベルの色（未使用）
   * @param {number} xOffset - X座標のオフセット（デフォルトは-5）
   */
  drawDepthLabel(depth, position, color = 0xffffff, xOffset = -5) {
    const sprite = this.createDepthLabelSprite(depth);
    const labelPosition = new THREE.Vector3(position.x + xOffset, position.y, position.z);
    sprite.position.copy(labelPosition);
    
    this.depthLabels.push(sprite);
    this.depthLabelPositions.push(labelPosition);
    this.scene.add(sprite);
  }

  /**
   * 収集したすべての断面情報を一度に描画
   */
  drawAllPendingCrossSections() {
    // 収集済みの断面リクエストを重複除去して一括描画
    const uniqueSections = new Map();
    this.pendingCrossSections.forEach(section => {
      const key = `${section.pipeObject.id || section.pipeObject.uuid}_${section.crossSectionZ}`;
      if (!uniqueSections.has(key)) {
        uniqueSections.set(key, section);
      }
    });
    
    uniqueSections.forEach(section => {
      this.drawCrossSectionCircle(
        section.center,
        section.radius,
        section.axisDirection,
        section.color,
        section.pipeObject,
        section.crossSectionZ
      );
    });
    
    this.pendingCrossSections = [];
  }

  /**
   * 管路の断面（円形）を描画
   * CSGを使用して垂直面で切断した断面を表示
   */
  drawCrossSectionCircle(center, radius, axisDirection, color, pipeObject = null, crossSectionZ = null) {
    // CSGにより断面形状(交差部分)のみを生成
    if (isNaN(center.x) || isNaN(center.y) || isNaN(center.z) || isNaN(radius) || radius <= 0) {
      return;
    }
    
    if (pipeObject && crossSectionZ !== null) {
      try {
        this.drawCSGCrossSection(pipeObject, crossSectionZ, color);
      } catch (error) {
        console.error('CSG断面の作成に失敗しました:', error);
      }
    }
  }

  /**
   * CSGを使用して垂直面で切断した断面を描画
   * @param {THREE.Object3D} pipeObject - 管路オブジェクト
   * @param {number} crossSectionZ - 断面平面のZ座標
   * @param {THREE.Color} color - 断面の色
   */
  drawCSGCrossSection(pipeObject, crossSectionZ, color) {
    // 元メッシュを複製し、薄いボックスとの交差(Intersect)で断面メッシュを得る
    if (!pipeObject.geometry) {
      return;
    }
    
    const pipeMesh = new THREE.Mesh(
      pipeObject.geometry.clone(),
      new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide })
    );
    pipeMesh.position.copy(pipeObject.position);
    pipeMesh.rotation.copy(pipeObject.rotation);
    pipeMesh.scale.copy(pipeObject.scale);
    pipeMesh.updateMatrix();
    
    const planeGeometry = new THREE.BoxGeometry(1000, 1000, 0.01);
    const planeMesh = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    planeMesh.position.set(0, 0, crossSectionZ);
    planeMesh.updateMatrix();
    
    const intersectionMesh = CSG.intersect(pipeMesh, planeMesh);
    intersectionMesh.material = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    intersectionMesh.visible = this.showCrossSections;
    
    this.crossSections.push(intersectionMesh);
    this.scene.add(intersectionMesh);
  }

  /**
   * 断面をクリア
   */
  clear() {
    // 表示済みの線・ラベル・断面メッシュをすべて破棄
    this.depthLines.forEach(line => {
      this.scene.remove(line);
      if (line.geometry) line.geometry.dispose();
      if (line.material) line.material.dispose();
    });
    this.depthLines = [];
    
    this.depthLabels.forEach(sprite => {
      this.scene.remove(sprite);
      if (sprite.material) {
        if (sprite.material.map) sprite.material.map.dispose();
        sprite.material.dispose();
      }
    });
    this.depthLabels = [];
    this.depthLabelPositions = [];
    
    this.crossSections.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    this.crossSections = [];
    
    // グリッド線の中心点をリセット
    this.gridCenter = null;
  }

  /**
   * 切り口の表示/非表示を切り替え
   * @param {boolean} show - 表示するかどうか
   */
  toggleCrossSections(show) {
    // 生成済みの断面メッシュの可視/不可視を切り替え
    this.showCrossSections = show;
    this.crossSections.forEach(crossSection => {
      crossSection.visible = show;
    });
  }

  /**
   * 深さラベルのスケールをカメラからの距離に応じて更新
   */
  update() {
    // カメラ距離に応じて深さラベルのスケールを調整
    if (!this.camera || this.depthLabels.length === 0) {
      return;
    }
    
    const baseDistance = 20;
    const baseScale = 2;
    const minScale = 0.5;
    const maxScale = 5;
    
    for (let i = 0; i < this.depthLabels.length; i++) {
      const sprite = this.depthLabels[i];
      const position = this.depthLabelPositions[i];
      
      if (sprite && position) {
        const distance = this.camera.position.distanceTo(position);
        const scaleFactor = Math.max(minScale, Math.min(maxScale, (distance / baseDistance) * baseScale));
        sprite.scale.set(scaleFactor, scaleFactor * 0.25, 1);
      }
    }
  }

  /**
   * ウィンドウリサイズ時に呼び出される
   * Line2のLineMaterialのresolutionを更新
   */
  handleResize(width, height) {
    this.depthLines.forEach(line => {
      if (line.material && line.material.resolution) {
        line.material.resolution.set(width, height);
      }
      if (line.children) {
        line.children.forEach(child => {
          if (child.material && child.material.resolution) {
            child.material.resolution.set(width, height);
          }
        });
      }
    });
  }

  /**
   * クリーンアップ
   */
  dispose() {
    this.clear();
  }

  /**
   * 管路の半径を取得
   * @param {Object} objectData - 管路オブジェクトのデータ
   * @returns {number} - 管路の半径
   */
  getPipeRadius(objectData) {
    let radius = (objectData.attributes?.radius != null) ? Number(objectData.attributes.radius) : 0;
    if (radius > 5) radius = radius / 1000;
    return radius;
  }

  /**
   * 管路の始点と終点を計算
   * @param {Array} startVertex - 始点の頂点データ
   * @param {Array} endVertex - 終点の頂点データ
   * @param {Object} objectData - 管路オブジェクトのデータ
   * @param {number} radius - 管路の半径
   * @returns {Object} - {start, end} 始点と終点のVector3
   */
  getPipeStartEnd(startVertex, endVertex, objectData, radius) {
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
      const startCenterY = startDepth > 0 ? -(startDepth + radius) : startDepth;
      const endCenterY = endDepth > 0 ? -(endDepth + radius) : endDepth;
      start = new THREE.Vector3(startVertex[1], startCenterY, startVertex[0]);
      end = new THREE.Vector3(endVertex[1], endCenterY, endVertex[0]);
    } else {
      start = new THREE.Vector3(startVertex[1], startVertex[2] - radius, startVertex[0]);
      end = new THREE.Vector3(endVertex[1], endVertex[2] - radius, endVertex[0]);
    }

    return { start, end };
  }
}

export default CrossSectionPlane;
