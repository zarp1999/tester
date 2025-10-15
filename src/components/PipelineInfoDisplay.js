import React, { useState } from 'react';
import './PipelineInfoDisplay.css';

/**
 * 管路情報表示コンポーネント
 * クリックされた管路オブジェクトの情報をテーブル形式で表示
 */
function PipelineInfoDisplay({ selectedObject }) {
  if (!selectedObject) return null;

  const { id, type, attributes, geometry } = selectedObject;
  const geom = geometry?.[0];

  // 管路情報のデータを準備
  const getPipelineData = () => {
    const startPoint = geom?.vertices?.[0];
    const endPoint = geom?.vertices?.[geom.vertices.length - 1];
    const center = geom?.center;
    
    // 長さの計算
    let length = 0;
    if (startPoint && endPoint) {
      length = Math.sqrt(
        Math.pow(endPoint[0] - startPoint[0], 2) +
        Math.pow(endPoint[1] - startPoint[1], 2) +
        Math.pow(endPoint[2] - startPoint[2], 2)
      );
    }

    return {
      形状: geom?.type || type || '',
      識別番号: id || '',
      東西: center ? center[0].toFixed(3) : (startPoint ? startPoint[0].toFixed(3) : ''),
      上被り深さ: center ? (-center[1]).toFixed(3) : (startPoint ? (-startPoint[1]).toFixed(3) : ''),
      南北: center ? center[2].toFixed(3) : (startPoint ? startPoint[2].toFixed(3) : ''),
      直径: attributes?.radius ? (attributes.radius / 1000).toFixed(3) : (attributes?.diameter ? (attributes.diameter / 1000).toFixed(3) : ''),
      長さ: length.toFixed(3),
      端点1東西: startPoint ? startPoint[0].toFixed(3) : '',
      端点1上被り深さ: startPoint ? (-startPoint[1]).toFixed(3) : '',
      端点1南北: startPoint ? startPoint[2].toFixed(3) : '',
      端点2東西: endPoint ? endPoint[0].toFixed(3) : '',
      端点2上被り深さ: endPoint ? (-endPoint[1]).toFixed(3) : '',
      端点2南北: endPoint ? endPoint[2].toFixed(3) : '',
      種別: attributes?.pipe_kind || '',
      材質: attributes?.material || ''
    };
  };

  const pipelineData = getPipelineData();

  return (
    <div className="pipeline-info-display">
      <table className="pipeline-table">
        <thead>
          <tr>
            <th>項目</th>
            <th>設定済み</th>
            <th>入力欄</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(pipelineData).map(([key, value]) => (
            <tr key={key}>
              <td className="item-label">{key}</td>
              <td className="set-value">{value || '-'}</td>
              <td className="input-field">
                <input 
                  type="text" 
                  defaultValue={value || ''} 
                  className="pipeline-input"
                  placeholder="入力してください"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PipelineInfoDisplay;

