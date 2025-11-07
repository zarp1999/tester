import React, { useState } from 'react';
import Scene3D from '../Scene3D';
import { DistanceMeasurementDisplay } from '../DistanceMeasurement';
import './CrossSectionView.css';

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

  // Scene3Dから距離計測結果を受け取るコールバック
  const handleMeasurementUpdate = (result) => {
    setMeasurementResult(result);
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
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={startPoint === '始点'}
                          onChange={(e) => setStartPoint(e.target.checked ? '始点' : '終点')}
                        />
                        <span>{startPoint === '始点' ? '始点' : '終点'}</span>
                      </label>
                    </td>
                  </tr>
                </tbody>
              </table>
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
        cityJsonData={cityJsonData}
        userPositions={userPositions}
        shapeTypes={shapeTypes}
        layerData={layerData}
        sourceTypes={sourceTypes}
        hideInfoPanel={true}
        hideBackground={true}
        enableCrossSectionMode={true}
        onMeasurementUpdate={handleMeasurementUpdate}
      />
    </div>
  );
}

export default CrossSectionView;

