import React, { useState, useEffect } from 'react';
import './App.css';
import Scene3D from './components/Scene3D';

/**
 * メインアプリケーションコンポーネント
 * CityJSONデータを読み込み、3Dシーンを表示
 */
function App() {
  const [cityJsonData, setCityJsonData] = useState(null);
  const [layerData, setLayerData] = useState(null);
  const [shapeTypes, setShapeTypes] = useState(null);
  const [sourceTypes, setSourceTypes] = useState(null);
  const [userPositions, setUserPositions] = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);

  // データの読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        const [cityJson, layers, shapes, sources, positions] = await Promise.all([
          fetch('/Cityjson_sample.json').then(res => res.json()),
          fetch('/layer_panel.json').then(res => res.json()),
          fetch('/shape_type.json').then(res => res.json()),
          fetch('/source_types.json').then(res => res.json()),
          fetch('/user_pos_1.json').then(res => res.json())
        ]);

        setCityJsonData(cityJson);
        setLayerData(layers);
        setShapeTypes(shapes);
        setSourceTypes(sources);
        setUserPositions(positions);
      } catch (error) {
        console.error('データの読み込みエラー:', error);
      }
    };

    loadData();
  }, []);

  const handleObjectClick = (object) => {
    setSelectedObject(object);
  };


  const handleCameraPositionChange = (positionData) => {
    console.log('カメラ位置変更:', positionData);
    // 将来的にはここでAPIを呼び出してデータを取得
  };

  if (!cityJsonData || !layerData) {
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
          <Scene3D
            cityJsonData={cityJsonData}
            onObjectClick={handleObjectClick}
            onCameraMove={handleCameraPositionChange}
            userPositions={userPositions}
            shapeTypes={shapeTypes}
            layerData={layerData}
            sourceTypes={sourceTypes}
          />
        </div>
      </div>
    </div>
  );
}

export default App;

