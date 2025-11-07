import React, { useState, useRef } from 'react';
import Scene3D from '../Scene3D';
import { DistanceMeasurementDisplay } from '../DistanceMeasurement';
import './CrossSectionView.css';
import * as THREE from 'three';

/**
 * 断面図生成ビュー
 * - 3Dシーンと同じ管路表示機能を使用
 * - 左上のUIパネルが異なる（断面図生成機能）
 * - 将来的に断面図生成専用の機能を追加予定
 */
function CrossSectionView({ cityJsonData, userPositions, shapeTypes, layerData, sourceTypes }) {
  // 距離計測結果のstate
  const [measurementResult, setMeasurementResult] = useState(null);
  
  // 断面自動作成モードのstate
  const [autoModeEnabled, setAutoModeEnabled] = useState(false);
  
  // 断面自動作成モードのパラメータ
  const [angle, setAngle] = useState(90);
  const [interval, setInterval] = useState(10);
  const [startPoint, setStartPoint] = useState('始点'); // '始点' or '終点'

  // 選択された管路の情報
  const [selectedObject, setSelectedObject] = useState(null);
  const selectedMeshRef = useRef(null);

  // 生成された断面のリスト
  const [generatedSections, setGeneratedSections] = useState([]);
  
  // 断面表示モードのstate
  const [sectionViewMode, setSectionViewMode] = useState(false); // false: 3D表示, true: 断面表示
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  // Scene3Dのref
  const scene3DRef = useRef(null);

  // Scene3Dから距離計測結果を受け取るコールバック
  const handleMeasurementUpdate = (result) => {
    setMeasurementResult(result);
  };

  // Scene3Dから選択されたオブジェクトを受け取るコールバック
  const handleSelectedObjectChange = (objectData, mesh) => {
    setSelectedObject(objectData);
    selectedMeshRef.current = mesh;
  };

  // 断面自動生成の計算と描画
  const generateCrossSections = () => {
    if (!selectedObject || !selectedMeshRef.current) {
      alert('管路を選択してください');
      return;
    }

    const objectData = selectedObject;
    const geometry = objectData.geometry?.[0];
    
    if (!geometry || !geometry.vertices || geometry.vertices.length < 2) {
      alert('管路の頂点データが不足しています');
      return;
    }

    // 管路の半径を取得
    const getPipeRadius = (objData) => {
      let radius = (objData.attributes?.radius != null) ? Number(objData.attributes.radius) : 0.3;
      if (radius > 5) radius = radius / 1000;
      return Math.max(radius, 0.05);
    };

    const radius = getPipeRadius(objectData);
    const vertices = geometry.vertices;

    // 管路の始点と終点を計算
    const getPipeStartEnd = (startVertex, endVertex, objData, r) => {
      const hasDepthAttrs = (
        objData.attributes &&
        objData.attributes.start_point_depth != null &&
        objData.attributes.end_point_depth != null &&
        Number.isFinite(Number(objData.attributes.start_point_depth)) &&
        Number.isFinite(Number(objData.attributes.end_point_depth))
      );

      let start, end;
      if (hasDepthAttrs) {
        const startDepth = Number(objData.attributes.start_point_depth / 100);
        const endDepth = Number(objData.attributes.end_point_depth / 100);
        const startCenterY = startDepth > 0 ? -(startDepth + r) : startDepth;
        const endCenterY = endDepth > 0 ? -(endDepth + r) : endDepth;
        start = new THREE.Vector3(startVertex[1], startCenterY, startVertex[0]);
        end = new THREE.Vector3(endVertex[1], endCenterY, endVertex[0]);
      } else {
        start = new THREE.Vector3(startVertex[1], startVertex[2] - r, startVertex[0]);
        end = new THREE.Vector3(endVertex[1], endVertex[2] - r, endVertex[0]);
      }

      return { start, end };
    };

    const { start, end } = getPipeStartEnd(vertices[0], vertices[vertices.length - 1], objectData, radius);

    // 開始点を決定
    const startPosition = startPoint === '始点' ? start.clone() : end.clone();
    const endPosition = startPoint === '始点' ? end.clone() : start.clone();
    
    // 管路の方向ベクトル
    const pipeDirection = endPosition.clone().sub(startPosition).normalize();
    const pipeLength = startPosition.distanceTo(endPosition);

    // 角度をラジアンに変換
    const angleRad = THREE.MathUtils.degToRad(angle);

    // 断面の位置を計算
    const sections = [];
    let currentDistance = 0;
    let sectionIndex = 1;

    while (currentDistance <= pipeLength) {
      // 断面の位置（管路に沿った位置）
      const sectionPosition = startPosition.clone().add(
        pipeDirection.clone().multiplyScalar(currentDistance)
      );

      // 断面の法線ベクトル（管路の方向に対して角度を適用）
      // 管路の方向をY軸として、角度に応じて回転
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3(1, 0, 0);
      
      // 管路の方向に垂直な平面を作成
      const normal = pipeDirection.clone();
      const tangent = normal.clone().cross(up).normalize();
      if (tangent.length() < 0.1) {
        tangent.copy(right).cross(normal).normalize();
      }
      const binormal = normal.clone().cross(tangent).normalize();

      // 角度に応じて法線を回転
      const rotatedNormal = tangent.clone().multiplyScalar(Math.cos(angleRad))
        .add(binormal.clone().multiplyScalar(Math.sin(angleRad))).normalize();

      sections.push({
        id: `断面_${String(sectionIndex).padStart(3, '0')}`,
        position: sectionPosition,
        normal: rotatedNormal,
        pipeDirection: pipeDirection,
        z: sectionPosition.z, // Z座標（断面平面の識別用）
        index: sectionIndex - 1
      });

      currentDistance += interval;
      sectionIndex++;
    }

    setGeneratedSections(sections);
    
    // Scene3Dに断面を描画するよう通知（後で実装）
    if (scene3DRef.current && scene3DRef.current.drawGeneratedSections) {
      scene3DRef.current.drawGeneratedSections(sections);
    }
  };

  return (
    <div className="cross-section-view">
      {/* 断面図生成用のUIパネル */}
      <div className="cross-section-panel">
        <div className="panel-header">
          ◆断面<br />
          左クリック:中心軸に垂直な鉛直面による断面を表示します<br />
          左ドラッグ: 始点終点を含む鉛直面による断面を表示します<br />
          BSキー: 原面をクリア<br />
          ◆離隔計測<br />
          左Shift+左ドラッグ: 断面の間の最近接距離を計測します<br />
          ESCキー: 離隔をクリア<br />
          ◆表示切り替え<br />
          1: ガイド 2: 背景 5:離隔 6: 折れ線 7: 管路 8: 路面 9: 地表面<br />
          Space: 透視投影・正射投影 マウスホイール:拡大縮小 +左Ctrlキー:低達<br />
          ◆離隔計測結果
          {/* 距離計測結果を表示 */}
          {measurementResult && (
            <DistanceMeasurementDisplay measurementResult={measurementResult} />
          )}
          
          {/* 断面自動作成モードの設定テーブル */}
          {autoModeEnabled && (
            <div className="auto-mode-settings">
              <table className="auto-mode-table">
                <thead>
                  <tr>
                    <th>入力項目</th>
                    <th>入力欄</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>角度</td>
                    <td>
                      <input
                        type="number"
                        value={angle}
                        onChange={(e) => setAngle(parseFloat(e.target.value) || 90)}
                        step="0.1"
                        min="0"
                        max="180"
                        placeholder="90"
                      />
                      <span className="unit">[deg.]</span>
                    </td>
                  </tr>
                  <tr>
                    <td>間隔</td>
                    <td>
                      <input
                        type="number"
                        value={interval}
                        onChange={(e) => setInterval(parseFloat(e.target.value) || 10)}
                        step="0.1"
                        min="0.1"
                        placeholder="10"
                      />
                      <span className="unit">[m]</span>
                    </td>
                  </tr>
                  <tr>
                    <td>開始点</td>
                    <td>
                      <div className="radio-group">
                        <label className="radio-label">
                          <input
                            type="radio"
                            name="startPoint"
                            value="始点"
                            checked={startPoint === '始点'}
                            onChange={(e) => setStartPoint(e.target.value)}
                          />
                          <span>始点</span>
                        </label>
                        <label className="radio-label">
                          <input
                            type="radio"
                            name="startPoint"
                            value="終点"
                            checked={startPoint === '終点'}
                            onChange={(e) => setStartPoint(e.target.value)}
                          />
                          <span>終点</span>
                        </label>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              
              {/* 実行ボタンと断面表示に遷移ボタン */}
              <div className="auto-mode-buttons">
                <button 
                  className="execute-button"
                  onClick={generateCrossSections}
                  disabled={!selectedObject}
                >
                  実行
                </button>
                <button 
                  className="transition-button"
                  onClick={() => {
                    if (generatedSections.length === 0) {
                      alert('先に断面を生成してください');
                      return;
                    }
                    setSectionViewMode(true);
                    setCurrentSectionIndex(0);
                  }}
                  disabled={generatedSections.length === 0}
                >
                  断面表示に遷移
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 断面自動作成モードのトグルスイッチ（右上） */}
      <div className="auto-mode-toggle">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={autoModeEnabled}
            onChange={(e) => setAutoModeEnabled(e.target.checked)}
          />
          <span className="toggle-label">断面自動作成モード</span>
        </label>
      </div>

      {/* 3Dシーン（既存のScene3Dコンポーネントを使用） */}
      <Scene3D
        ref={scene3DRef}
        cityJsonData={cityJsonData}
        userPositions={userPositions}
        shapeTypes={shapeTypes}
        layerData={layerData}
        sourceTypes={sourceTypes}
        hideInfoPanel={true}
        hideBackground={true}
        enableCrossSectionMode={true}
        autoModeEnabled={autoModeEnabled}
        onMeasurementUpdate={handleMeasurementUpdate}
        onSelectedObjectChange={handleSelectedObjectChange}
        generatedSections={generatedSections}
        sectionViewMode={sectionViewMode}
        currentSectionIndex={currentSectionIndex}
      />

      {/* 画面下部に断面名のリストを表示 */}
      {generatedSections.length > 0 && !sectionViewMode && (
        <div className="section-list">
          <div className="section-list-title">生成された断面:</div>
          <div className="section-list-items">
            {generatedSections.map((section, index) => (
              <div key={section.id} className="section-list-item">
                {section.id}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 画面下部に←断面_001→のナビゲーション */}
      {sectionViewMode && generatedSections.length > 0 && (
        <div className="section-navigation">
          <button
            className="nav-button prev-button"
            onClick={() => {
              const prevIndex = currentSectionIndex > 0 
                ? currentSectionIndex - 1 
                : generatedSections.length - 1;
              setCurrentSectionIndex(prevIndex);
            }}
          >
            ←
          </button>
          <div className="section-name">
            {generatedSections[currentSectionIndex]?.id || ''}
          </div>
          <button
            className="nav-button next-button"
            onClick={() => {
              const nextIndex = currentSectionIndex < generatedSections.length - 1
                ? currentSectionIndex + 1
                : 0;
              setCurrentSectionIndex(nextIndex);
            }}
          >
            →
          </button>
          <button
            className="nav-button close-button"
            onClick={() => {
              setSectionViewMode(false);
            }}
          >
            閉じる
          </button>
        </div>
      )}
    </div>
  );
}

export default CrossSectionView;

