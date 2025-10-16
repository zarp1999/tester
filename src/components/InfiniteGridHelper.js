import * as THREE from 'three';

/**
 * 無限地表面ヘルパー
 * シェーダーベースの無限に広がる地表面を作成
 * カメラに追従し、距離に応じてフェードアウト
 */
class InfiniteGridHelper extends THREE.Mesh {
  constructor(color = new THREE.Color(0xF4A460), distance = 8000) {
    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: color },
        uDistance: { value: distance }
      },
      transparent: true,
      vertexShader: `
        varying vec3 worldPosition;
        
        uniform float uDistance;
        
        void main() {
          // 地表面を完全に固定位置に設定
          vec3 pos = position.xzy * uDistance;
          pos.y = 0.0; // Y座標を完全に0に固定
          
          worldPosition = pos;
          
          // モデルビュー変換を適用してカメラからの相対位置を計算
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 worldPosition;
        
        uniform vec3 uColor;
        uniform float uDistance;
        
        void main() {
          // 距離に応じたフェード（カメラ位置に依存しない安定した計算）
          float dist = length(worldPosition.xz);
          float d = 1.0 - min(dist / uDistance, 1.0);
          
          // グリッド線なしで単色表示
          gl_FragColor = vec4(uColor.rgb, pow(d, 3.0) * 0.8);
          
          if (gl_FragColor.a <= 0.0) discard;
        }
      `,
      extensions: {
        derivatives: true
      }
    });
    
    super(geometry, material);
    this.frustumCulled = false;
  }
}

export default InfiniteGridHelper;

