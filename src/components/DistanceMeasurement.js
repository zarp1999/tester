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
    this.measurementLine = null;
    this.measurementPoints = [];
    this.textMesh = null;
    this.previewLine = null; // プレビュー線

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
      Object.values(this.objectsRef),
      false
    );

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      const clickedPoint = intersects[0].point; // 実際の交点
      
      if (clickedObject.userData.objectData) {
        this.isMeasuring = true;
        this.startPipe = clickedObject;
        this.startPoint = clickedPoint.clone(); // 実際のクリック位置を保存
        
        // 視覚的なフィードバック（始点を強調表示）
        this.highlightPipe(this.startPipe, 0x00ff00);
        
        // 始点マーカーを表示
        this.drawMeasurementPoint(this.startPoint, 0x00ff00);
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
      Object.values(this.objectsRef),
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
      currentPoint = new THREE.Vector3();
      this.raycasterRef.ray.intersectPlane(plane, currentPoint);
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

    // 左Shiftキー + 左クリックのみ処理
    if (!event.shiftKey || event.button !== 0) {
      this.isMeasuring = false;
      this.clearPreviewLine();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // 現在のマウス位置で交点を計算
    this.raycasterRef.setFromCamera(this.mouseRef, this.camera);
    
    // まず管路との交点を試みる
    const pipeIntersects = this.raycasterRef.intersectObjects(
      Object.values(this.objectsRef),
      false
    );

    let endPoint = null;
    let endPipe = null;

    if (pipeIntersects.length > 0) {
      // 管路との交点がある場合
      endPoint = pipeIntersects[0].point.clone();
      endPipe = pipeIntersects[0].object;
    } else {
      // 管路との交点がない場合、始点の高さの平面との交点を使用
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.startPoint.y);
      endPoint = new THREE.Vector3();
      this.raycasterRef.ray.intersectPlane(plane, endPoint);
    }

    if (endPoint) {
      this.endPoint = endPoint;
      this.endPipe = endPipe;
      
      // 終点の管路がある場合は強調表示
      if (this.endPipe && this.endPipe !== this.startPipe && this.endPipe.userData.objectData) {
        this.highlightPipe(this.endPipe, 0x0000ff);
      }
      
      // 距離を計測
      this.calculateDistance();
    }

    this.isMeasuring = false;
    this.clearPreviewLine();
  }

  /**
   * キーボードハンドラー（Escキーでクリア）
   */
  handleKeyDown(event) {
    if (event.key === 'Escape') {
      this.clear();
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
   * プレビュー線を描画
   */
  drawPreviewLine(startPos, endPos) {
    const geometry = new THREE.BufferGeometry().setFromPoints([startPos, endPos]);
    const material = new THREE.LineBasicMaterial({
      color: 0xffff00,
      linewidth: 3,
      opacity: 0.6,
      transparent: true,
      depthTest: false
    });

    this.measurementLine = new THREE.Line(geometry, material);
    this.scene.add(this.measurementLine);
  }

  /**
   * プレビュー線をクリア
   */
  clearPreviewLine() {
    if (this.measurementLine) {
      this.scene.remove(this.measurementLine);
      this.measurementLine.geometry.dispose();
      this.measurementLine.material.dispose();
      this.measurementLine = null;
    }
  }

  /**
   * 計測線を描画（太い線）
   */
  drawMeasurementLine(startPos, endPos, distance) {
    // 線を描画（TubeGeometryで太い線を実現）
    const path = new THREE.LineCurve3(startPos, endPos);
    const tubeGeometry = new THREE.TubeGeometry(path, 20, 0.1, 8, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8,
      depthTest: false
    });

    this.measurementLine = new THREE.Mesh(tubeGeometry, tubeMaterial);
    this.scene.add(this.measurementLine);

    // 距離テキストを線の中央に表示
    this.drawDistanceText(startPos, endPos, distance);

    // 端点を球で表示
    this.drawMeasurementPoint(startPos, 0x00ff00);
    this.drawMeasurementPoint(endPos, 0x0000ff);
  }

  /**
   * 距離テキストを描画
   */
  drawDistanceText(startPos, endPos, distance) {
    // 中点を計算
    const midPoint = new THREE.Vector3()
      .addVectors(startPos, endPos)
      .multiplyScalar(0.5);

    // テキストスプライトを作成
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;

    // 背景
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // テキスト
    context.fillStyle = 'white';
    context.font = 'Bold 32px Arial';
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
    this.textMesh.scale.set(5, 1.25, 1);
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
    if (!this.startPoint || !this.endPoint) return;

    // 指定点間の距離（実際のクリック位置）
    const specifiedPointA = this.startPoint.clone();
    const specifiedPointB = this.endPoint.clone();
    const specifiedDistance = specifiedPointA.distanceTo(specifiedPointB);

    // 計測結果のベース
    let measurementData = {
      pipeA: {
        id: this.startPipe?.userData?.objectData?.id || '不明',
        name: this.startPipe?.userData?.objectData?.attributes?.name || 
              this.startPipe?.userData?.objectData?.attributes?.pipe_kind || '管路A'
      },
      pipeB: {
        id: this.endPipe?.userData?.objectData?.id || '不明',
        name: this.endPipe?.userData?.objectData?.attributes?.name || 
              this.endPipe?.userData?.objectData?.attributes?.pipe_kind || '管路B'
      },
      specified: {
        pointA: specifiedPointA,
        pointB: specifiedPointB,
        distance: specifiedDistance
      }
    };

    // 両方の管路が存在する場合のみ近接点を計算
    if (this.startPipe && this.endPipe && 
        this.startPipe.userData.objectData && this.endPipe.userData.objectData) {
      
      const startData = this.startPipe.userData.objectData;
      const endData = this.endPipe.userData.objectData;

      // 管路の端点を取得
      const startGeom = startData.geometry?.[0];
      const endGeom = endData.geometry?.[0];

      if (startGeom && endGeom && startGeom.vertices && endGeom.vertices &&
          startGeom.vertices.length >= 2 && endGeom.vertices.length >= 2) {
        
        // 深度属性の処理
        const getPoint3D = (vertices, index, depthAttr) => {
          const v = vertices[index];
          if (depthAttr != null && Number.isFinite(Number(depthAttr))) {
            const depth = Number(depthAttr / 100);
            return new THREE.Vector3(v[0], depth > 0 ? -depth : depth, v[1]);
          }
          return new THREE.Vector3(v[0], v[2] || 0, v[1]);
        };

        // 管路Aの端点
        const startA = getPoint3D(startGeom.vertices, 0, startData.attributes?.start_point_depth);
        const endA = getPoint3D(startGeom.vertices, startGeom.vertices.length - 1, startData.attributes?.end_point_depth);

        // 管路Bの端点
        const startB = getPoint3D(endGeom.vertices, 0, endData.attributes?.start_point_depth);
        const endB = getPoint3D(endGeom.vertices, endGeom.vertices.length - 1, endData.attributes?.end_point_depth);

        // 最近接点を計算（線分と線分の最短距離）
        const closestPoints = this.getClosestPointsBetweenLineSegments(startA, endA, startB, endB);
        const closestDistance = closestPoints.pointA.distanceTo(closestPoints.pointB);

        measurementData.closest = {
          pointA: closestPoints.pointA,
          pointB: closestPoints.pointB,
          distance: closestDistance
        };
      }
    }

    // 計測結果を保存
    this.measurementResult = measurementData;

    // 計測線を描画
    this.drawMeasurementLine(specifiedPointA, specifiedPointB, specifiedDistance);

    // 終点マーカーを表示
    this.drawMeasurementPoint(this.endPoint, 0x0000ff);

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
   * 計測をクリア
   */
  clear() {
    // ハイライトをクリア
    if (this.startPipe) {
      this.clearHighlight(this.startPipe);
      this.startPipe = null;
    }
    if (this.endPipe) {
      this.clearHighlight(this.endPipe);
      this.endPipe = null;
    }

    // 計測線を削除
    if (this.measurementLine) {
      this.scene.remove(this.measurementLine);
      this.measurementLine.geometry.dispose();
      this.measurementLine.material.dispose();
      this.measurementLine = null;
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

    // 計測結果をクリア
    this.measurementResult = null;

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

