import React, { useState } from 'react';
import './CameraControl.css';

function CameraControl({ positions }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);

  const handlePositionClick = (position) => {
    setSelectedPosition(position);
    // ここで将来的にカメラを移動させる処理を追加
    console.log('カメラ位置を変更:', position);
  };

  return (
    <div className={`camera-control ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div 
        className="camera-control-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3>
          <span className="icon">📷</span>
          カメラ位置
        </h3>
        <button className="toggle-button">
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {isExpanded && (
        <div className="camera-control-content">
          <p className="camera-control-description">
            保存されたカメラ位置を選択
          </p>

          <div className="position-list">
            {positions.map((pos, index) => (
              <div
                key={pos.id}
                className={`position-item ${selectedPosition?.id === pos.id ? 'active' : ''}`}
                onClick={() => handlePositionClick(pos)}
              >
                <div className="position-number">{index + 1}</div>
                <div className="position-info">
                  <div className="position-description">
                    {pos.description}
                  </div>
                  <div className="position-coords">
                    カメラ: ({pos.camera.position[0].toFixed(1)}, {pos.camera.position[1].toFixed(1)}, {pos.camera.position[2].toFixed(1)})
                  </div>
                  <div className="position-time">
                    {new Date(pos.timestamp).toLocaleString('ja-JP')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="camera-control-footer">
            <button className="camera-button">
              <span>➕</span> 現在位置を保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CameraControl;

