import React from 'react';
import * as THREE from 'three';
import './DistanceMeasurement.css';

/**
 * 距離計測コンポーネント
 * - 左Shift + 左ドラッグで管路間の距離を計測
 * - 近接点と指定点の両方を表示
 * - Escキーでクリア
 */
class DistanceMeasurement {
  constructor(scene, camera, renderer, objectsRef, raycasterRef, mouseRef) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.objectsRef = objectsRef;
    this.raycasterRef = raycasterRef;
    this.mouseRef = mouseRef;

    // 計測状態
    this.isMeasuring = false;
    this.startPipe = null;
    this.endPipe = null;
    this.startPoint = null;  // 実際のクリック位置（始点）
    this.endPoint = null;    // 実際のクリック位置（終点）
    this.measurementLine = null;  // 指定距離の線（赤）
    this.closestLine = null;      // 近接距離の線（青）
    this.measurementPoints = [];
    this.textMesh = null;
    this.previewLine = null; // プレビュー線
    
    // 線の方向ベクトル（カメラ向きの回転用）
    this.lineDirection = null;
    this.lineMidPoint = null;
    this.closestLineDirection = null;
    this.closestLineMidPoint = null;

    // 表示状態管理
    this.showClosest = true;   // 近接距離を表示
    this.showSpecified = false; // 指定距離を非表示

    // 計測結果データ
    this.measurementResult = null;

    // イベントハンドラーのバインド
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    // 結果更新コールバック
    this.onResultUpdate = null;
  }

  /**
   * イベントリスナーを追加
   */
  enable(domElement) {
    domElement.addEventListener('mousedown', this.handleMouseDown);
    domElement.addEventListener('mousemove', this.handleMouseMove);
    domElement.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * イベントリスナーを削除
   */
  disable(domElement) {
    domElement.removeEventListener('mousedown', this.handleMouseDown);
    domElement.removeEventListener('mousemove', this.handleMouseMove);
    domElement.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * マウスダウンハンドラー
   */
  handleMouseDown(event) {
    // 左Shiftキー + 左クリックのみ処理
    if (!event.shiftKey || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // Raycasterで管路または地面を検出
    this.raycasterRef.setFromCamera(this.mouseRef, this.camera);
    const intersects = this.raycasterRef.intersectObjects(
      Object.values(this.objectsRef.current),
      false
    );

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      const clickedPoint = intersects[0].point; // 実際の交点
      
      if (clickedObject.userData.objectData) {
        this.isMeasuring = true;
        this.startPipe = clickedObject;
        this.startPoint = clickedPoint.clone(); // 実際のクリック位置を保存
      }
    }
  }

  /**
   * マウス移動ハンドラー
   */
  handleMouseMove(event) {
    if (!this.isMeasuring || !this.startPoint) {
      return;
    }

    // 現在のマウス位置で交点を計算
    this.raycasterRef.setFromCamera(this.mouseRef, this.camera);
    
    // まず管路との交点を試みる
    const pipeIntersects = this.raycasterRef.intersectObjects(
      Object.values(this.objectsRef.current),
      false
    );

    // 既存のプレビュー線を削除
    this.clearPreviewLine();

    let currentPoint = null;

    if (pipeIntersects.length > 0) {
      // 管路との交点がある場合
      currentPoint = pipeIntersects[0].point;
    } else {
      // 管路との交点がない場合、始点の高さの平面との交点を使用
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.startPoint.y);
      const planeIntersect = new THREE.Vector3();
      this.raycasterRef.ray.intersectPlane(plane, planeIntersect);
      
      // 交点が始点から一定距離内の場合のみ使用（遠くに飛ばないように）
      if (planeIntersect) {
        const distance = this.startPoint.distanceTo(planeIntersect);
        if (distance < 1000) {  // 1000m以内のみ有効
          currentPoint = planeIntersect;
        }
      }
    }

    if (currentPoint) {
      // プレビュー線を描画（始点から現在のマウス位置まで）
      this.drawPreviewLine(this.startPoint, currentPoint);
    }
  }

  /**
   * マウスアップハンドラー
   */
  handleMouseUp(event) {
    if (!this.isMeasuring || !this.startPoint) {
      return;
    }

    // 左クリックのみ処理（Shiftキーは計測開始時にチェック済み）
    if (event.button !== 0) {
      this.isMeasuring = false;
      this.clearPreviewLine();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // 現在のマウス位置で交点を計算
    this.raycasterRef.setFromCamera(this.mouseRef, this.camera);
    
    // 管路との交点のみを検出
    const pipeIntersects = this.raycasterRef.intersectObjects(
      Object.values(this.objectsRef.current),
      false
    );

    // 管路Bが存在し、管路Aと異なる場合のみ計測を実行
    if (pipeIntersects.length > 0) {
      const clickedObject = pipeIntersects[0].object;
      const clickedPoint = pipeIntersects[0].point;
      
      // 終点も管路オブジェクトで、始点とは異なる管路である必要がある
      if (clickedObject.userData.objectData && clickedObject !== this.startPipe) {
        this.endPoint = clickedPoint.clone();
        this.endPipe = clickedObject;
        
        // 距離を計測
        this.calculateDistance();
      } else {
        // 同じ管路をクリックした場合は何もしない
        console.log('同じ管路が選択されました。異なる管路を選択してください。');
      }
    } else {
      // 管路以外をクリックした場合
      console.log('管路を選択してください。');
    }

    this.isMeasuring = false;
    this.clearPreviewLine();
  }

  /**
   * キーボードハンドラー（Escキーでクリア、5キーで表示切替）
   */
  handleKeyDown(event) {
    if (event.key === 'Escape') {
      this.clear();
    } else if (event.key === '5') {
      // 近接と指定の表示を切り替え
      this.toggleLineDisplay();
    }
  }

  /**
   * 近接と指定の表示を切り替え
   */
  toggleLineDisplay() {
    if (!this.measurementResult) return;

    // 表示状態を切り替え
    this.showClosest = !this.showClosest;
    this.showSpecified = !this.showSpecified;

    // 線の表示/非表示を更新
    if (this.closestLine) {
      this.closestLine.visible = this.showClosest;
    }
    if (this.measurementLine) {
      this.measurementLine.visible = this.showSpecified;
    }
  }

  /**
   * 管路をハイライト表示
   */
  highlightPipe(pipe, color) {
    if (pipe && pipe.material) {
      pipe.material.emissive.setHex(color);
      pipe.material.emissiveIntensity = 0.5;
    }
  }

  /**
   * ハイライトをクリア
   */
  clearHighlight(pipe) {
    if (pipe && pipe.material) {
      pipe.material.emissive.setHex(0x000000);
      pipe.material.emissiveIntensity = 0;
    }
  }

  /**
   * プレビュー線を描画（幅広い帯状の赤色半透明線）
   */
  drawPreviewLine(startPos, endPos) {
    // 2点間の距離と方向を計算
    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const length = direction.length();
    const midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    
    // 幅広い平面ジオメトリを作成（1枚の板）
    const width = 0.15;  // 線の幅
    const geometry = new THREE.PlaneGeometry(length, width);
    
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,  // 赤色
      transparent: true,
      opacity: 0.5,     // 透明度50%
      depthTest: false,
      side: THREE.DoubleSide  // 両面から見えるように
    });

    this.previewLine = new THREE.Mesh(geometry, material);
    this.previewLine.position.copy(midPoint);
    
    // 2点を結ぶ方向に回転
    this.previewLine.quaternion.setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      direction.normalize()
    );
    
    this.scene.add(this.previewLine);
  }

  /**
   * プレビュー線をクリア
   */
  clearPreviewLine() {
    if (this.previewLine) {
      this.scene.remove(this.previewLine);
      this.previewLine.geometry.dispose();
      this.previewLine.material.dispose();
      this.previewLine = null;
    }
  }

  /**
   * 計測線を描画（幅広い帯状の線、テキストを線の一部として埋め込み）
   * @param {THREE.Vector3} startPos - 開始位置
   * @param {THREE.Vector3} endPos - 終了位置
   * @param {number} distance - 距離
   * @param {string} color - 線の色（'red' or 'blue'）
   * @param {string} lineType - 線のタイプ（'specified' or 'closest'）
   */
  drawMeasurementLine(startPos, endPos, distance, color = 'red', lineType = 'specified') {
    // 2点間の距離と方向を計算
    const direction = new THREE.Vector3().subVectors(endPos, startPos);
    const length = direction.length();
    const midPoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
    
    // 幅広い平面ジオメトリを作成（1枚の板）
    const width = 0.15;  // 線の幅
    const geometry = new THREE.PlaneGeometry(length, width);
    
    // テキスト付きのテクスチャを作成（線の幅方向に表示）
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    // ジオメトリのアスペクト比に合わせる: length(長) x width(0.3)
    const aspectRatio = length / width;
    canvas.width = 2048;  // 線の長さに対応（横方向）
    canvas.height = Math.max(128, 2048 / aspectRatio); // 線の幅に対応（縦方向）
    
    // 背景を指定色で塗りつぶす
    const bgColor = color === 'blue' ? 'rgba(0, 0, 255, 0.8)' : 'rgba(255, 0, 0, 0.8)';
    context.fillStyle = bgColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // テキストを一行で描画（横書き、線のサイズに100%合わせる）
    const text = `${distance.toFixed(3)}m`;
    
    // 回転後のサイズ：テキストの高さ = canvas.width に収まる必要がある
    //              テキストの幅 = canvas.height に収まる必要がある
    let fontSize = Math.floor(canvas.width * 0.6); // 初期サイズ60%
    context.font = `Bold ${fontSize}px Arial`;
    
    // テキストの実際の幅を測定
    let textMetrics = context.measureText(text);
    let textWidth = textMetrics.width;
    
    // テキストが回転後に収まるように調整（canvas.heightに収まるか）
    if (textWidth > canvas.height * 0.95) {
      fontSize = Math.floor(fontSize * (canvas.height * 0.95) / textWidth);
      context.font = `Bold ${fontSize}px Arial`;
    }
    
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI / 2); 
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 0, 0);
    context.restore();
    
    const texture = new THREE.CanvasTexture(canvas);
    
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      side: THREE.DoubleSide  // 両面から見えるように
    });

    const lineMesh = new THREE.Mesh(geometry, material);
    lineMesh.position.copy(midPoint);
    
    // 線のタイプに応じて保存と表示状態を設定
    if (lineType === 'closest') {
      this.closestLine = lineMesh;
      this.closestLineDirection = direction.normalize();
      this.closestLineMidPoint = midPoint.clone();
      lineMesh.visible = this.showClosest;  // 表示状態を反映
    } else {
      this.measurementLine = lineMesh;
      this.lineDirection = direction.normalize();
      this.lineMidPoint = midPoint.clone();
      lineMesh.visible = this.showSpecified;  // 表示状態を反映
    }
    
    // 初期回転を設定
    this.updateLineRotation(lineType);
    
    this.scene.add(lineMesh);
  }

  /**
   * 距離テキストを描画（線の中に表示）
   */
  drawDistanceText(startPos, endPos, distance) {
    // 中点を計算
    const midPoint = new THREE.Vector3()
      .addVectors(startPos, endPos)
      .multiplyScalar(0.5);

    // テキストスプライトを作成
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 64;

    // 背景を透明にする
    context.clearRect(0, 0, canvas.width, canvas.height);

    // テキストに影をつけて見やすくする
    context.shadowColor = 'rgba(0, 0, 0, 0.8)';
    context.shadowBlur = 8;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;

    // テキスト
    context.fillStyle = 'white';
    context.font = 'Bold 28px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(`${distance.toFixed(3)}m`, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true
    });

    this.textMesh = new THREE.Sprite(spriteMaterial);
    this.textMesh.position.copy(midPoint);
    // スケールを小さくして線の中に収まるようにする
    this.textMesh.scale.set(3, 0.2, 1);
    this.scene.add(this.textMesh);
  }

  /**
   * 計測点を描画
   */
  drawMeasurementPoint(position, color) {
    const geometry = new THREE.SphereGeometry(0.2, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      depthTest: false,
      transparent: true,
      opacity: 0.8
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(position);
    this.scene.add(sphere);
    this.measurementPoints.push(sphere);
  }

  /**
   * 管路間の距離を計算
   */
  calculateDistance() {
    // 両方の管路が存在することを確認
    if (!this.startPoint || !this.endPoint || !this.startPipe || !this.endPipe) {
      console.error('管路AとBの両方が必要です');
      return;
    }

    // 両方が管路オブジェクトであることを確認
    if (!this.startPipe.userData.objectData || !this.endPipe.userData.objectData) {
      console.error('選択されたオブジェクトが管路ではありません');
      return;
    }

    // 管路データを取得（すでに存在確認済み）
    const startData = this.startPipe.userData.objectData;
    const endData = this.endPipe.userData.objectData;

    // 指定点間の距離（実際のクリック位置）
    const specifiedPointA = this.startPoint.clone();
    const specifiedPointB = this.endPoint.clone();
    const specifiedDistance = specifiedPointA.distanceTo(specifiedPointB);

    // 計測結果のベース
    let measurementData = {
      pipeA: {
        id: startData.id || '不明',
        name: startData.attributes?.name || startData.attributes?.pipe_kind || '管路A'
      },
      pipeB: {
        id: endData.id || '不明',
        name: endData.attributes?.name || endData.attributes?.pipe_kind || '管路B'
      },
      specified: {
        pointA: specifiedPointA,
        pointB: specifiedPointB,
        distance: specifiedDistance
      }
    };

    // 近接点を計算（頂点、辺、面すべてを含めた最短距離）
    if (this.startPipe.geometry && this.endPipe.geometry) {
      const closestPoints = this.getClosestPointsBetweenMeshes(this.startPipe, this.endPipe);
      
      if (closestPoints) {
        measurementData.closest = {
          pointA: closestPoints.pointA,
          pointB: closestPoints.pointB,
          distance: closestPoints.distance
        };
      }
    }

    // 計測結果を保存
    this.measurementResult = measurementData;

    // 指定距離の計測線を描画（赤色）
    this.drawMeasurementLine(specifiedPointA, specifiedPointB, specifiedDistance, 'red', 'specified');

    // 近接距離の計測線を描画（青色）
    if (measurementData.closest) {
      this.drawMeasurementLine(
        measurementData.closest.pointA,
        measurementData.closest.pointB,
        measurementData.closest.distance,
        'blue',
        'closest'
      );
    }

    // 結果更新コールバックを呼び出し
    if (this.onResultUpdate) {
      this.onResultUpdate(this.measurementResult);
    }
  }

  /**
   * 2つの線分間の最近接点を計算
   */
  getClosestPointsBetweenLineSegments(a1, a2, b1, b2) {
    const d1 = a2.clone().sub(a1);
    const d2 = b2.clone().sub(b1);
    const r = a1.clone().sub(b1);

    const a = d1.dot(d1);
    const e = d2.dot(d2);
    const f = d2.dot(r);

    let s = 0;
    let t = 0;

    if (a <= Number.EPSILON && e <= Number.EPSILON) {
      // 両方が点の場合
      s = 0;
      t = 0;
    } else if (a <= Number.EPSILON) {
      // 最初の線分が点の場合
      s = 0;
      t = Math.max(0, Math.min(1, f / e));
    } else {
      const c = d1.dot(r);
      if (e <= Number.EPSILON) {
        // 2番目の線分が点の場合
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else {
        // 一般的な場合
        const b = d1.dot(d2);
        const denom = a * e - b * b;

        if (denom !== 0) {
          s = Math.max(0, Math.min(1, (b * f - c * e) / denom));
        } else {
          s = 0;
        }

        t = (b * s + f) / e;

        if (t < 0) {
          t = 0;
          s = Math.max(0, Math.min(1, -c / a));
        } else if (t > 1) {
          t = 1;
          s = Math.max(0, Math.min(1, (b - c) / a));
        }
      }
    }

    const pointA = a1.clone().add(d1.clone().multiplyScalar(s));
    const pointB = b1.clone().add(d2.clone().multiplyScalar(t));

    return { pointA, pointB };
  }

  /**
   * 2つのメッシュ間の最短距離を計算（頂点、辺、面すべてを含む）
   */
  getClosestPointsBetweenMeshes(meshA, meshB) {
    const geometryA = meshA.geometry;
    const geometryB = meshB.geometry;
    
    if (!geometryA || !geometryB) return null;
    
    const positionA = geometryA.attributes.position;
    const positionB = geometryB.attributes.position;
    const indexA = geometryA.index;
    const indexB = geometryB.index;
    
    if (!positionA || !positionB) return null;
    
    let minDistance = Infinity;
    let closestPointA = null;
    let closestPointB = null;
    
    // 管路Aの全頂点をワールド座標で取得
    const verticesA = [];
    for (let i = 0; i < positionA.count; i++) {
      const v = new THREE.Vector3(
        positionA.getX(i),
        positionA.getY(i),
        positionA.getZ(i)
      );
      meshA.localToWorld(v);
      verticesA.push(v);
    }
    
    // 管路Bの全頂点をワールド座標で取得
    const verticesB = [];
    for (let i = 0; i < positionB.count; i++) {
      const v = new THREE.Vector3(
        positionB.getX(i),
        positionB.getY(i),
        positionB.getZ(i)
      );
      meshB.localToWorld(v);
      verticesB.push(v);
    }
    
    // 1. 管路Aの各頂点 vs 管路Bの各面
    if (indexB) {
      for (let i = 0; i < verticesA.length; i++) {
        for (let j = 0; j < indexB.count; j += 3) {
          const v0 = verticesB[indexB.getX(j)];
          const v1 = verticesB[indexB.getX(j + 1)];
          const v2 = verticesB[indexB.getX(j + 2)];
          
          const result = this.getClosestPointToTriangle(verticesA[i], v0, v1, v2);
          if (result.distance < minDistance) {
            minDistance = result.distance;
            closestPointA = verticesA[i];
            closestPointB = result.closestPoint;
          }
        }
      }
    }
    
    // 2. 管路Bの各頂点 vs 管路Aの各面
    if (indexA) {
      for (let i = 0; i < verticesB.length; i++) {
        for (let j = 0; j < indexA.count; j += 3) {
          const v0 = verticesA[indexA.getX(j)];
          const v1 = verticesA[indexA.getX(j + 1)];
          const v2 = verticesA[indexA.getX(j + 2)];
          
          const result = this.getClosestPointToTriangle(verticesB[i], v0, v1, v2);
          if (result.distance < minDistance) {
            minDistance = result.distance;
            closestPointA = result.closestPoint;
            closestPointB = verticesB[i];
          }
        }
      }
    }
    
    // 3. 管路Aの各辺 vs 管路Bの各辺
    if (indexA && indexB) {
      for (let i = 0; i < indexA.count; i += 3) {
        const edgesA = [
          [indexA.getX(i), indexA.getX(i + 1)],
          [indexA.getX(i + 1), indexA.getX(i + 2)],
          [indexA.getX(i + 2), indexA.getX(i)]
        ];
        
        for (const [a0, a1] of edgesA) {
          for (let j = 0; j < indexB.count; j += 3) {
            const edgesB = [
              [indexB.getX(j), indexB.getX(j + 1)],
              [indexB.getX(j + 1), indexB.getX(j + 2)],
              [indexB.getX(j + 2), indexB.getX(j)]
            ];
            
            for (const [b0, b1] of edgesB) {
              const result = this.getClosestPointsBetweenLineSegments(
                verticesA[a0], verticesA[a1],
                verticesB[b0], verticesB[b1]
              );
              const distance = result.pointA.distanceTo(result.pointB);
              if (distance < minDistance) {
                minDistance = distance;
                closestPointA = result.pointA;
                closestPointB = result.pointB;
              }
            }
          }
        }
      }
    }
    
    if (closestPointA && closestPointB) {
      return {
        pointA: closestPointA,
        pointB: closestPointB,
        distance: minDistance
      };
    }
    
    return null;
  }

  /**
   * 点と三角形の最短距離を計算
   */
  getClosestPointToTriangle(point, v0, v1, v2) {
    const edge0 = new THREE.Vector3().subVectors(v1, v0);
    const edge1 = new THREE.Vector3().subVectors(v2, v0);
    const v0ToPoint = new THREE.Vector3().subVectors(point, v0);
    
    const a = edge0.dot(edge0);
    const b = edge0.dot(edge1);
    const c = edge1.dot(edge1);
    const d = edge0.dot(v0ToPoint);
    const e = edge1.dot(v0ToPoint);
    
    const det = a * c - b * b;
    let s = b * e - c * d;
    let t = b * d - a * e;
    
    if (s + t <= det) {
      if (s < 0) {
        if (t < 0) {
          // region 4
          s = 0;
          t = 0;
        } else {
          // region 3
          s = 0;
          t = Math.max(0, Math.min(1, e / c));
        }
      } else if (t < 0) {
        // region 5
        s = Math.max(0, Math.min(1, d / a));
        t = 0;
      } else {
        // region 0 (interior)
        const invDet = 1 / det;
        s *= invDet;
        t *= invDet;
      }
    } else {
      if (s < 0) {
        // region 2
        s = 0;
        t = 1;
      } else if (t < 0) {
        // region 6
        s = 1;
        t = 0;
      } else {
        // region 1
        const numer = c + e - b - d;
        const denom = a - 2 * b + c;
        s = Math.max(0, Math.min(1, numer / denom));
        t = 1 - s;
      }
    }
    
    const closestPoint = v0.clone()
      .add(edge0.clone().multiplyScalar(s))
      .add(edge1.clone().multiplyScalar(t));
    
    const distance = point.distanceTo(closestPoint);
    
    return { closestPoint, distance };
  }

  /**
   * 結果更新コールバックを設定
   */
  setResultUpdateCallback(callback) {
    this.onResultUpdate = callback;
  }

  /**
   * 計測結果を取得
   */
  getResult() {
    return this.measurementResult;
  }

  /**
   * 線の回転を更新（カメラの方向に向ける）
   * @param {string} lineType - 'specified' または 'closest' または undefined（両方）
   */
  updateLineRotation(lineType) {
    // lineTypeが指定されていない場合は両方を更新
    if (!lineType || lineType === 'specified') {
      this.updateSingleLineRotation(
        this.measurementLine,
        this.lineDirection,
        this.lineMidPoint
      );
    }
    
    if (!lineType || lineType === 'closest') {
      this.updateSingleLineRotation(
        this.closestLine,
        this.closestLineDirection,
        this.closestLineMidPoint
      );
    }
  }

  /**
   * 単一の線の回転を更新
   */
  updateSingleLineRotation(line, lineDirection, lineMidPoint) {
    if (!line || !lineDirection || !lineMidPoint) {
      return;
    }

    // カメラから線の中心への方向ベクトル
    const cameraToLine = new THREE.Vector3()
      .subVectors(lineMidPoint, this.camera.position)
      .normalize();

    // 線の方向ベクトル（X軸）
    const lineDir = lineDirection.clone();

    // カメラ方向と線方向の外積でY軸（法線）を計算
    const normal = new THREE.Vector3().crossVectors(lineDir, cameraToLine).normalize();
    
    // もし外積がゼロベクトルに近い場合（線がカメラ方向と平行）、デフォルトの法線を使用
    if (normal.length() < 0.001) {
      normal.set(0, 1, 0);
    }

    // Z軸を計算
    const binormal = new THREE.Vector3().crossVectors(lineDir, normal).normalize();

    // 回転行列を作成
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeBasis(lineDir, normal, binormal);

    // クォータニオンに変換
    line.quaternion.setFromRotationMatrix(rotationMatrix);
  }

  /**
   * 毎フレーム更新（カメラ移動時に線を回転）
   */
  update() {
    this.updateLineRotation();
  }

  /**
   * 計測をクリア
   */
  clear() {
    // 管路参照をクリア
    if (this.startPipe) {
      this.startPipe = null;
    }
    if (this.endPipe) {
      this.endPipe = null;
    }

    // 指定距離の計測線を削除（赤）
    if (this.measurementLine) {
      this.scene.remove(this.measurementLine);
      this.measurementLine.geometry.dispose();
      if (this.measurementLine.material.map) {
        this.measurementLine.material.map.dispose();
      }
      this.measurementLine.material.dispose();
      this.measurementLine = null;
    }

    // 近接距離の計測線を削除（青）
    if (this.closestLine) {
      this.scene.remove(this.closestLine);
      this.closestLine.geometry.dispose();
      if (this.closestLine.material.map) {
        this.closestLine.material.map.dispose();
      }
      this.closestLine.material.dispose();
      this.closestLine = null;
    }

    // テキストを削除
    if (this.textMesh) {
      this.scene.remove(this.textMesh);
      this.textMesh.material.map.dispose();
      this.textMesh.material.dispose();
      this.textMesh = null;
    }

    // 計測点を削除
    this.measurementPoints.forEach(point => {
      this.scene.remove(point);
      point.geometry.dispose();
      point.material.dispose();
    });
    this.measurementPoints = [];

    // プレビュー線を削除
    this.clearPreviewLine();

    // 計測位置をクリア
    this.startPoint = null;
    this.endPoint = null;

    // 線の方向情報をクリア
    this.lineDirection = null;
    this.lineMidPoint = null;
    this.closestLineDirection = null;
    this.closestLineMidPoint = null;

    // 計測結果をクリア
    this.measurementResult = null;

    // 表示状態をリセット
    this.showClosest = true;   // 近接距離を表示
    this.showSpecified = false; // 指定距離を非表示

    // 結果更新コールバックを呼び出し
    if (this.onResultUpdate) {
      this.onResultUpdate(null);
    }

    this.isMeasuring = false;
  }

  /**
   * クリーンアップ
   */
  dispose(domElement) {
    this.clear();
    this.disable(domElement);
  }
}

// React統合用のコンポーネント
function DistanceMeasurementDisplay({ measurementResult }) {
  if (!measurementResult) {
    return null;
  }

  const { pipeA, pipeB, closest, specified } = measurementResult;

  return (
    <div className="distance-measurement-display">
      <div className="measurement-title">
        {pipeA.name}/{pipeB.name}間の離隔結果 (ESC クリア)
      </div>
      <div className="measurement-details">
        <div className="measurement-row">
          <span className="label">{pipeA.name}:</span>
          <span className="value">{pipeA.id}</span>
          <span className="label">{pipeB.name}:</span>
          <span className="value">{pipeB.id}</span>
        </div>
        {closest && (
          <div className="measurement-row">
            <span className="label">近接</span>
            <span className="point">
              A点: ({closest.pointA.x.toFixed(2)}, {closest.pointA.y.toFixed(2)}, {closest.pointA.z.toFixed(2)})
            </span>
            <span className="point">
              B点: ({closest.pointB.x.toFixed(2)}, {closest.pointB.y.toFixed(2)}, {closest.pointB.z.toFixed(2)})
            </span>
            <span className="distance">距離: {closest.distance.toFixed(3)}[m]</span>
          </div>
        )}
        <div className="measurement-row">
          <span className="label">指定</span>
          <span className="point">
            A点: ({specified.pointA.x.toFixed(2)}, {specified.pointA.y.toFixed(2)}, {specified.pointA.z.toFixed(2)})
          </span>
          <span className="point">
            B点: ({specified.pointB.x.toFixed(2)}, {specified.pointB.y.toFixed(2)}, {specified.pointB.z.toFixed(2)})
          </span>
          <span className="distance">距離: {specified.distance.toFixed(3)}[m]</span>
        </div>
      </div>
    </div>
  );
}

export { DistanceMeasurement, DistanceMeasurementDisplay };
