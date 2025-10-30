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
   * 線の位置は断面平面と管路中心線の交点を通り、縦線は管路の最も高い位置（浅い位置）まで描画
   * @param {THREE.Object3D} pipeObject - クリックされた管路オブジェクト
   * @param {THREE.Vector3} clickPoint - クリックした位置の3D座標（Z座標から断面平面を定義）
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
    
    // 座標変換（Scene3D.jsと同じロジック）
    let start, end;
    if (hasDepthAttrs) {
      // start_point_depthとend_point_depthは管路の天端（上端）の深さを表す
      // 管路の中心位置を計算するために、天端の深さから半径を引く
      const startDepth = Number(objectData.attributes.start_point_depth / 100);
      const endDepth = Number(objectData.attributes.end_point_depth / 100);
      const startCenterY = startDepth >= 0 ? -(startDepth + radius): startDepth;
      const endCenterY = endDepth >= 0 ? -(endDepth + radius): endDepth;
      start = new THREE.Vector3(startVertex[1], startCenterY, startVertex[0]);
      end = new THREE.Vector3(endVertex[1], endCenterY, endVertex[0]);
    } else {
      start = new THREE.Vector3(startVertex[1], startVertex[2] - radius, startVertex[0]);
      end = new THREE.Vector3(endVertex[1], endVertex[2] - radius, endVertex[0]);
    }
    
    // 管路の中心軸方向ベクトル
    const axisDirection = new THREE.Vector3().subVectors(end, start).normalize();
    const direction = new THREE.Vector3().subVectors(end, start);
    
    // 断面平面（Z=clickPoint.z）と管路中心線の交点を計算
    let intersectionPoint;
    if (Math.abs(direction.z) > 0.001) {
      const t = (clickPoint.z - start.z) / direction.z;
      intersectionPoint = start.clone().add(direction.clone().multiplyScalar(t));
    } else {
      // 管路がZ軸に垂直な場合は、始点を使用
      intersectionPoint = start.clone();
      intersectionPoint.z = clickPoint.z;
    }
    
    // Y座標（深さ）- 断面平面との交点の深さを使用
    const pipeDepth = intersectionPoint.y;
    const maxDepth = -50; // 最大深さ（50m）
    
    // 交点のX,Z座標を使用するためのVector3を作成（管路の中心線上の位置）
    const linePosition = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);
    
    // 床（Y=0）から-50mまで1mごとに線を描画
    for (let depth = 0; depth >= maxDepth; depth -= 1) {
      // 1m間隔のグリッド線（灰色）
      this.drawEastWestLine(depth, linePosition, 0x888888, false);
      
      // このグリッド線が断面平面（Z=clickPoint.z）上の管路を切っている位置に縦線を描画
      this.drawVerticalLinesAtDepth(depth, clickPoint.z);
    }
    
    // クリックした管路に縦線を描画（管路の色で）+ ラベルもグループ化
    // 管路の最も高い位置（浅い位置）まで描画
    this.drawVerticalLine(linePosition, pipeDepth, pipeObject.material.color, radius);
    
    // 断面平面（クリック位置のZ座標）と管路が交差する位置に縦線を描画
    // （クリックした管路は既に描画済みなのでスキップ）
    this.drawVerticalLinesAtCrossSectionPlane(clickPoint.z, pipeObject);
    
    // 管路の断面を描画（CSGを使用して垂直面で切断）
    this.drawCrossSectionCircle(center, radius, axisDirection, pipeObject.material.color, pipeObject, clickPoint.z);
    
    console.log(`断面を生成しました（断面平面: Z=${clickPoint.z.toFixed(2)}, 縦線位置: X=${intersectionPoint.x.toFixed(2)}, 管路最高位置: Y=${pipeDepth.toFixed(2)}m）`);
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
          // start_point_depthとend_point_depthは管路の天端（上端）の深さを表す
          // 管路の中心位置を計算するために、天端の深さから半径を引く
          const startDepth = Number(objectData.attributes.start_point_depth / 100);
          const endDepth = Number(objectData.attributes.end_point_depth / 100);
          const startCenterY = startDepth >= 0 ? -(startDepth + radius): startDepth;
          const endCenterY = endDepth >= 0 ? -(endDepth + radius): endDepth;
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
              
              // 交差点の位置に縦線とラベルを描画（交点の深さまで）
              const pipePosition = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);
              this.drawVerticalLine(pipePosition, intersectionPoint.y, obj.material.color, radius);
              
              // この位置で管路の切り口（円形）も描画（CSGを使用）
              const axisDirection = direction.clone().normalize();
              this.drawCrossSectionCircle(intersectionPoint, radius, axisDirection, obj.material.color, obj, crossSectionZ);
            }
          }
        }
      }
    });
  }

  /**
   * グリッド線が断面平面上の管路を切っている位置に縦線を描画
   * @param {number} targetDepth - グリッド線の深さ（Y座標）
   * @param {number} crossSectionZ - 断面平面のZ座標
   */
  drawVerticalLinesAtDepth(targetDepth, crossSectionZ) {
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
          // start_point_depthとend_point_depthは管路の天端（上端）の深さを表す
          // 管路の中心位置を計算するために、天端の深さから半径を引く
          const startDepth = Number(objectData.attributes.start_point_depth / 100);
          const endDepth = Number(objectData.attributes.end_point_depth / 100);
          const startCenterY = startDepth >= 0 ? -(startDepth + radius): startDepth;
          const endCenterY = endDepth >= 0 ? -(endDepth + radius): endDepth;
          start = new THREE.Vector3(startVertex[1], startCenterY, startVertex[0]);
          end = new THREE.Vector3(endVertex[1], endCenterY, endVertex[0]);
        } else {
          start = new THREE.Vector3(startVertex[1], startVertex[2] - radius, startVertex[0]);
          end = new THREE.Vector3(endVertex[1], endVertex[2] - radius, endVertex[0]);
        }
        
        // 管路が断面平面（Z=crossSectionZ）と交差しているかチェック
        const minZ = Math.min(start.z, end.z) - radius;
        const maxZ = Math.max(start.z, end.z) + radius;
        
        // 断面平面と交差していない管路はスキップ
        if (crossSectionZ < minZ || crossSectionZ > maxZ) {
          return;
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
              
              // 交点が断面平面の近くにあるかチェック（許容誤差: 半径分）
              if (Math.abs(intersectionPoint.z - crossSectionZ) > radius) {
                return;  // 断面平面から離れすぎている場合はスキップ
              }
              
              // 交差点の位置に縦線とラベルを描画（交点の深さまで）
              const pipePosition = new THREE.Vector3(intersectionPoint.x, 0, intersectionPoint.z);
              this.drawVerticalLine(pipePosition, intersectionPoint.y, obj.material.color, radius);
              
              // この位置で管路の切り口（円形）も描画（CSGを使用）
              const axisDirection = direction.clone().normalize();
              this.drawCrossSectionCircle(intersectionPoint, radius, axisDirection, obj.material.color, obj, crossSectionZ);
            }
          }
        }
      }
    });
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
    
    // Line2用のLineGeometryを作成
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions([
      startPoint.x, startPoint.y, startPoint.z,
      endPoint.x, endPoint.y, endPoint.z
    ]);
    
    // LineMaterialを使用（太い線が正しく描画される）
    const lineMaterial = new LineMaterial({
      color: color,
      linewidth: highlight ? 5 : 2,  // ピクセル単位での太さ
      transparent: !highlight,
      opacity: highlight ? 1.0 : 0.6,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      worldUnits: false,  // ピクセル単位を使用
      vertexColors: false,
      dashed: false
    });
    
    const line = new Line2(lineGeometry, lineMaterial);
    line.computeLineDistances();  // 重要: これを呼び出さないと線が表示されない
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
   * 縦線を描画（床から管路の上端まで）+ ラベルをグループ化
   * @param {THREE.Vector3} position - 線の位置（X,Z座標）
   * @param {number} pipeDepth - 管路の中心深さ（Y座標）
   * @param {THREE.Color} color - 線の色（管路の色）
   * @param {number} radius - 管路の半径
   * @returns {THREE.Group} - 縦線とラベルを含むグループ
   */
  drawVerticalLine(position, pipeDepth, color, radius = 0) {
    // グループを作成（縦線とラベルを一緒に管理）
    const lineGroup = new THREE.Group();
    
    // グループ全体の位置を設定
    lineGroup.position.set(position.x, 0, position.z);
    
    // 床（Y=0）から管路の上端までの縦線（グループ内の相対座標）
    const pipeTopY = pipeDepth + radius; // 管路の上端（中心深さ + 半径）
    const startPoint = new THREE.Vector3(0, 0, 0); // グループの原点から（地表面）
    const endPoint = new THREE.Vector3(0, pipeTopY, 0); // Y軸方向に管路の上端まで
    
    // Line2用のLineGeometryを作成
    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions([
      startPoint.x, startPoint.y, startPoint.z,
      endPoint.x, endPoint.y, endPoint.z
    ]);
    
    // 管路の色を使用（Line2のLineMaterial）
    const lineMaterial = new LineMaterial({
      color: color,
      linewidth: 3,  // ピクセル単位での太さ
      transparent: true,
      opacity: 0.8,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
      worldUnits: false,  // ピクセル単位を使用
      vertexColors: false,
      dashed: false
    });
    
    const line = new Line2(lineGeometry, lineMaterial);
    line.computeLineDistances();  // 重要: これを呼び出さないと線が表示されない
    lineGroup.add(line); // グループに線を追加
    
    // 縦線の中点にラベルを作成（グループ内の相対座標）
    const labelY = (0 + pipeTopY) / 2; // 地表面と管路上端の中点
    // ラベルには地表面から管路上端までの深さを表示（createDepthLabelSpriteで絶対値に変換される）
    const labelSprite = this.createDepthLabelSprite(pipeTopY);
    labelSprite.position.set(0, labelY, 0); // グループの原点から相対的な位置
    lineGroup.add(labelSprite); // グループにラベルを追加
    
    // ワールド座標でのラベル位置を計算（スケール調整用）
    const labelWorldPosition = new THREE.Vector3(position.x, labelY, position.z);
    
    this.depthLines.push(lineGroup);
    this.depthLabels.push(labelSprite); // ラベルの参照も保持
    this.depthLabelPositions.push(labelWorldPosition); // 位置情報も保持
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
    
    // 背景を透明にする
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // テキストに影をつけて見やすくする
    context.shadowColor = 'rgba(0, 0, 0, 0.9)';
    context.shadowBlur = 12;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 3;
    
    // テキストは常に白色
    context.fillStyle = 'white';
    context.font = 'Bold 120px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${Math.abs(depth).toFixed(3)}m`, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,  // 線の後ろに隠れないようにする
      transparent: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(2, 0.5, 1);  // 初期スケール
    
    return sprite;
  }

  /**
   * 深さラベルを描画
   * @param {number} depth - 深さ（Y座標）
   * @param {THREE.Vector3} position - ラベル位置
   * @param {number} color - ラベルの色（16進数、デフォルトは白）※現在未使用、常に白色で表示
   * @param {number} xOffset - X座標のオフセット（デフォルトは-5、横線用）
   */
  drawDepthLabel(depth, position, color = 0xffffff, xOffset = -5) {
    const sprite = this.createDepthLabelSprite(depth);
    const labelPosition = new THREE.Vector3(position.x + xOffset, position.y, position.z);
    sprite.position.copy(labelPosition);
    
    // スプライトと位置を配列に追加（スケール調整用）
    this.depthLabels.push(sprite);
    this.depthLabelPositions.push(labelPosition);
    this.scene.add(sprite);
  }

  /**
   * 管路の断面（円形）を描画
   * CSGを使用して垂直面で切断した断面を表示
   */
  drawCrossSectionCircle(center, radius, axisDirection, color, pipeObject = null, crossSectionZ = null) {
    // NaNチェック
    if (isNaN(center.x) || isNaN(center.y) || isNaN(center.z)) {
      console.warn('断面の中心座標にNaNが含まれています', center);
      return;
    }
    
    if (isNaN(radius) || radius <= 0) {
      console.warn('断面の半径が不正です', radius);
      return;
    }
    
    // CSGを使用して垂直面で切断した断面を作成
    if (pipeObject && crossSectionZ !== null) {
      try {
        this.drawCSGCrossSection(pipeObject, crossSectionZ, color);
        return;
      } catch (error) {
        console.error('CSG断面の作成に失敗しました:', error);
        // フォールバック：従来の円形断面を表示
      }
    }
    
    // フォールバック：円形の断面（従来の方法）
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
    
    // 表示状態を設定（デフォルトは非表示）
    circleMesh.visible = this.showCrossSections;
    
    this.crossSections.push(circleMesh);
    this.scene.add(circleMesh);
  }

  /**
   * CSGを使用して垂直面で切断した断面を描画
   * @param {THREE.Object3D} pipeObject - 管路オブジェクト
   * @param {number} crossSectionZ - 断面平面のZ座標
   * @param {THREE.Color} color - 断面の色
   */
  drawCSGCrossSection(pipeObject, crossSectionZ, color) {
    // 管路のジオメトリとマテリアルを取得
    if (!pipeObject.geometry) {
      console.warn('管路のジオメトリが見つかりません');
      return;
    }
    
    // 管路のクローンを作成（元のメッシュを変更しないため）
    const pipeMesh = new THREE.Mesh(
      pipeObject.geometry.clone(),
      new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide })
    );
    pipeMesh.position.copy(pipeObject.position);
    pipeMesh.rotation.copy(pipeObject.rotation);
    pipeMesh.scale.copy(pipeObject.scale);
    pipeMesh.updateMatrix();
    
    // 断面平面を表す薄いボックスを作成（垂直面）
    const planeThickness = 0.01; // 薄いボックス
    const planeSize = 1000; // 十分に大きなサイズ
    const planeGeometry = new THREE.BoxGeometry(planeSize, planeSize, planeThickness);
    const planeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    
    // 断面平面の位置を設定（Z軸に垂直）
    planeMesh.position.set(0, 0, crossSectionZ);
    planeMesh.updateMatrix();
    
    // CSGで交差部分を計算
    const intersectionMesh = CSG.intersect(pipeMesh, planeMesh);
    
    // 結果のマテリアルを設定
    intersectionMesh.material = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    
    // 表示状態を設定（デフォルトは非表示）
    intersectionMesh.visible = this.showCrossSections;
    
    this.crossSections.push(intersectionMesh);
    this.scene.add(intersectionMesh);
    
    console.log('CSGで断面を作成しました:', crossSectionZ);
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
    this.depthLabelPositions = [];  // 位置配列もクリア
    
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
   * 深さラベルのスケールをカメラからの距離に応じて更新
   */
  update() {
    if (!this.camera || this.depthLabels.length === 0) {
      return;
    }
    
    // スケール調整パラメータ
    const baseDistance = 20;
    const baseScale = 2;
    const minScale = 0.5;
    const maxScale = 5;
    
    // 各深さラベルのスプライトのスケールを更新
    for (let i = 0; i < this.depthLabels.length; i++) {
      const sprite = this.depthLabels[i];
      const position = this.depthLabelPositions[i];
      
      if (sprite && position) {
        // カメラから位置までの距離を計算
        const distance = this.camera.position.distanceTo(position);
        
        // 距離に応じてスケールを調整
        const scaleFactor = Math.max(minScale, Math.min(maxScale, (distance / baseDistance) * baseScale));
        
        // アスペクト比を維持してスケールを適用（高さは幅の1/4）
        sprite.scale.set(scaleFactor, scaleFactor * 0.25, 1);
      }
    }
  }

  /**
   * ウィンドウリサイズ時に呼び出される
   * Line2のLineMaterialのresolutionを更新
   */
  handleResize(width, height) {
    const resolution = new THREE.Vector2(width, height);
    
    // すべてのdepthLinesのLineMaterialのresolutionを更新
    this.depthLines.forEach(line => {
      if (line.material && line.material.resolution) {
        line.material.resolution.set(width, height);
      }
      // グループの場合は子要素をチェック
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
}

export default CrossSectionPlane;
