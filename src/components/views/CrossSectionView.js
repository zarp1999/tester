import React, { useState } from 'react';
import Scene3D from '../Scene3D';
import './CrossSectionView.css';

/**
 * 断面図生成ビュー
 * - 3Dシーンと同じ管路表示機能を使用
 * - 左上のUIパネルが異なる（断面図生成機能）
 * - 将来的に断面図生成専用の機能を追加予定
 */
function CrossSectionView({ cityJsonData, onObjectClick, onCameraMove, userPositions, shapeTypes, layerData, sourceTypes }) {
  const [selectedPipelines, setSelectedPipelines] = useState([]);
  const [crossSectionData, setCrossSectionData] = useState(null);

  // 管路選択ハンドラー（断面図生成用）
  const handlePipelineSelect = (object) => {
    if (object && object.attributes) {
      // 選択された管路を配列に追加
      setSelectedPipelines(prev => {
        const exists = prev.find(p => p.feature_id === object.feature_id);
        if (exists) {
          return prev; // 既に選択されている場合は追加しない
        }
        return [...prev, object];
      });
    }
    // 親コンポーネントのハンドラーも呼び出す
    if (onObjectClick) {
      onObjectClick(object);
    }
  };

  // 断面図生成ハンドラー
  const handleGenerateCrossSection = () => {
    if (selectedPipelines.length < 2) {
      alert('断面図を生成するには、少なくとも2つの管路を選択してください。');
      return;
    }
    
    // TODO: 断面図生成ロジックを実装
    console.log('断面図生成:', selectedPipelines);
    setCrossSectionData({
      pipelines: selectedPipelines,
      generatedAt: new Date().toISOString()
    });
  };

  // 選択クリア
  const handleClearSelection = () => {
    setSelectedPipelines([]);
    setCrossSectionData(null);
  };

  return (
    <div className="cross-section-view">
      {/* 断面図生成用のUIパネル */}
      <div className="cross-section-panel">
        <div className="panel-header">
          ◆断面図生成
        </div>
        
        <div className="panel-content">
          <div className="info-section">
            管路をクリックして選択してください<br />
            選択中: {selectedPipelines.length}本
          </div>

          {selectedPipelines.length > 0 && (
            <div className="selected-pipelines">
              選択された管路:
              <ul>
                {selectedPipelines.map((pipe, index) => (
                  <li key={pipe.feature_id || index}>
                    {pipe.attributes?.pipe_kind || '管路'} 
                    (ID: {pipe.feature_id || '不明'})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="action-buttons">
            <button 
              className="generate-button"
              onClick={handleGenerateCrossSection}
              disabled={selectedPipelines.length < 2}
            >
              断面図を生成
            </button>
            <button 
              className="clear-button"
              onClick={handleClearSelection}
              disabled={selectedPipelines.length === 0}
            >
              選択をクリア
            </button>
          </div>

          {crossSectionData && (
            <div className="cross-section-result">
              断面図生成結果<br />
              生成時刻: {new Date(crossSectionData.generatedAt).toLocaleString('ja-JP')}<br />
              <span className="note">※ 断面図生成機能は開発中です</span>
            </div>
          )}
        </div>
      </div>

      {/* 3Dシーン（既存のScene3Dコンポーネントを使用） */}
      <Scene3D
        cityJsonData={cityJsonData}
        onObjectClick={handlePipelineSelect}
        onCameraMove={onCameraMove}
        userPositions={userPositions}
        shapeTypes={shapeTypes}
        layerData={layerData}
        sourceTypes={sourceTypes}
        hideInfoPanel={true}
        hideBackground={true}
      />
    </div>
  );
}

export default CrossSectionView;

