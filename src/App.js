import React, { useState, useEffect } from 'react';
import './App.css';
import Scene3D from './components/Scene3D';
import InfoPanel from './components/InfoPanel';
import LayerControl from './components/LayerControl';
import CameraControl from './components/CameraControl';

function App() {
  const [cityJsonData, setCityJsonData] = useState(null);
  const [layerData, setLayerData] = useState(null);
  const [shapeTypes, setShapeTypes] = useState(null);
  const [sourceTypes, setSourceTypes] = useState(null);
  const [userPositions, setUserPositions] = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);
  const [visibleLayers, setVisibleLayers] = useState({});

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

        // 全レイヤーを初期表示
        const initialVisibility = {};
        layers.layers.forEach(layer => {
          initialVisibility[layer.id] = layer.visible;
        });
        setVisibleLayers(initialVisibility);
      } catch (error) {
        console.error('データの読み込みエラー:', error);
      }
    };

    loadData();
  }, []);

  const handleObjectClick = (object) => {
    setSelectedObject(object);
  };

  const handleLayerToggle = (layerId) => {
    setVisibleLayers(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }));
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
      <header className="App-header">
        <h1>CityJSON 3D ビューア</h1>
        <p>管路インフラ可視化システム</p>
      </header>

      <div className="main-content">
        <LayerControl
          layers={layerData.layers}
          visibleLayers={visibleLayers}
          onLayerToggle={handleLayerToggle}
        />

        <div className="scene-container">
          <Scene3D
            cityJsonData={cityJsonData}
            visibleLayers={visibleLayers}
            onObjectClick={handleObjectClick}
            onCameraMove={handleCameraPositionChange}
          />
        </div>

        <div className="right-panel">
          {userPositions && (
            <CameraControl
              positions={userPositions.positions}
            />
          )}
          
          {selectedObject && (
            <InfoPanel
              object={selectedObject}
              onClose={() => setSelectedObject(null)}
            />
          )}
        </div>
      </div>

      <footer className="App-footer">
        <p>Three.js + React による3次元可視化</p>
      </footer>
    </div>
  );
}

export default App;

