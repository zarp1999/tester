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
          vec3 pos = position.xzy * uDistance;
          pos.xz += cameraPosition.xz;
          
          worldPosition = pos;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 worldPosition;
        
        uniform vec3 uColor;
        uniform float uDistance;
        
        void main() {
          // 距離に応じたフェード
          float d = 1.0 - min(distance(cameraPosition.xz, worldPosition.xz) / uDistance, 1.0);
          
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

