import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import Scene3DView from './components/views/Scene3DView';
import CrossSectionView from './components/views/CrossSectionView';

/**
 * メインアプリケーションコンポーネント
 * CityJSONデータを読み込み、複数のビュー（3Dシーン、断面図生成）を提供
 */
function App() {
  const [cityJsonData, setCityJsonData] = useState(null);
  const [layerData, setLayerData] = useState(null);
  const [shapeTypes, setShapeTypes] = useState(null);
  const [sourceTypes, setSourceTypes] = useState(null);
  const [userPositions, setUserPositions] = useState(null);
  const [loadingError, setLoadingError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // データの読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setLoadingError(null);

        // 各ファイルを個別に読み込み、詳細なエラー情報を取得
        const fetchWithErrorHandling = async (url, name) => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`${name}の読み込みに失敗しました (ステータス: ${response.status})`);
          }
          return response.json();
        };

        const [cityJson, layers, shapes, sources, positions] = await Promise.all([
          fetchWithErrorHandling('/Cityjson_sample.json', 'CityJSONデータ'),
          fetchWithErrorHandling('/layer_panel.json', 'レイヤーパネルデータ'),
          fetchWithErrorHandling('/shape_type.json', '形状タイプデータ'),
          fetchWithErrorHandling('/source_types.json', 'ソースタイプデータ'),
          fetchWithErrorHandling('/user_pos_1.json', 'ユーザー位置データ')
        ]);

        setCityJsonData(cityJson);
        setLayerData(layers);
        setShapeTypes(shapes);
        setSourceTypes(sources);
        setUserPositions(positions);
        setIsLoading(false);
      } catch (error) {
        console.error('データの読み込みエラー:', error);
        setLoadingError(error.message || 'データの読み込みに失敗しました');
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleRetry = () => {
    window.location.reload();
  };

  // エラー表示
  if (loadingError) {
    return (
      <div className="loading error">
        <p className="error-message">{loadingError}</p>
        <button className="retry-button" onClick={handleRetry}>
          再読み込み
        </button>
      </div>
    );
  }

  // ローディング表示
  if (isLoading || !cityJsonData || !layerData) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <p>データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="main-content">
        <div className="scene-container">
          <Routes>
            {/* 3Dシーンビュー */}
            <Route 
              path="/" 
              element={
                <Scene3DView
                  cityJsonData={cityJsonData}
                  userPositions={userPositions}
                  shapeTypes={shapeTypes}
                  layerData={layerData}
                  sourceTypes={sourceTypes}
                />
              } 
            />
            
            {/* 断面図生成ビュー */}
            <Route 
              path="/cross-section" 
              element={
                <CrossSectionView
                  cityJsonData={cityJsonData}
                  userPositions={userPositions}
                  shapeTypes={shapeTypes}
                  layerData={layerData}
                  sourceTypes={sourceTypes}
                />
              } 
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;

