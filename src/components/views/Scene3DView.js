import React from 'react';
import Scene3D from '../Scene3D';

/**
 * 3Dシーンビュー
 * - 既存のScene3Dコンポーネントをラップ
 * - 3D表示、管路情報、距離計測機能を提供
 */
function Scene3DView({ cityJsonData, userPositions, shapeTypes, layerData, sourceTypes }) {
  return (
    <Scene3D
      cityJsonData={cityJsonData}
      userPositions={userPositions}
      shapeTypes={shapeTypes}
      layerData={layerData}
      sourceTypes={sourceTypes}
    />
  );
}

export default Scene3DView;

