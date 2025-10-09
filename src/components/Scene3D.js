import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import './Scene3D.css';

function Scene3D({ cityJsonData, visibleLayers, onObjectClick, onCameraMove }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const objectsRef = useRef({});
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const hoveredObjectRef = useRef(null);

  // レイヤー判定関数
  const getLayerFromObject = (obj) => {
    const name = obj.attributes?.name || '';
    if (name.includes('水道')) return 'water';
    if (name.includes('下水道')) return 'sewer';
    if (name.includes('電')) return 'electric';
    if (name.includes('ガス')) return 'gas';
    if (name.includes('接続')) return 'junction';
    if (name.includes('制御')) return 'control';
    return 'other';
  };

  // 無限グリッドの作成
  const createInfiniteGrid = () => {
    const gridMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uSize1: { value: 1 },
        uSize2: { value: 10 },
        uColor: { value: new THREE.Color(0x444444) },
        uDistance: { value: 100 }
      },
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
        uniform float uSize1;
        uniform float uSize2;
        uniform vec3 uColor;
        uniform float uDistance;
        
        float getGrid(float size) {
          vec2 r = worldPosition.xz / size;
          vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
          float line = min(grid.x, grid.y);
          return 1.0 - min(line, 1.0);
        }
        
        void main() {
          float d = 1.0 - min(distance(cameraPosition.xz, worldPosition.xz) / uDistance, 1.0);
          float g1 = getGrid(uSize1);
          float g2 = getGrid(uSize2);
          float grid = g1 * 0.3 + g2 * 0.7;
          gl_FragColor = vec4(uColor, grid * d * 0.5);
          if (gl_FragColor.a <= 0.0) discard;
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const gridGeometry = new THREE.PlaneGeometry(1, 1);
    const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.y = -0.01;
    return gridMesh;
  };

  // 3Dオブジェクトの作成
  const createCityObject = (obj) => {
    let geometry;
    
    switch (obj.type) {
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
      case 'box':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const material = new THREE.MeshStandardMaterial({
      color: obj.color,
      metalness: 0.3,
      roughness: 0.7
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...obj.position);
    mesh.rotation.set(...obj.rotation);
    mesh.scale.set(...obj.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { objectData: obj, originalColor: obj.color };

    return mesh;
  };

  // マウス移動ハンドラー
  const handleMouseMove = (event) => {
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  // クリックハンドラー
  const handleClick = (event) => {
    const rect = mountRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(
      Object.values(objectsRef.current),
      false
    );

    if (intersects.length > 0) {
      const clickedObject = intersects[0].object;
      if (clickedObject.userData.objectData) {
        onObjectClick(clickedObject.userData.objectData);
      }
    }
  };

  // 初期化
  useEffect(() => {
    if (!mountRef.current) return;

    // シーンの作成
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e3c72);
    scene.fog = new THREE.Fog(0x1e3c72, 30, 100);
    sceneRef.current = scene;

    // カメラの作成
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(20, 20, 20);
    cameraRef.current = camera;

    // レンダラーの作成
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // コントロールの作成
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 100;
    controlsRef.current = controls;

    // カメラ変更イベント
    controls.addEventListener('change', () => {
      if (onCameraMove) {
        onCameraMove({
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z]
        });
      }
    });

    // ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight1.position.set(10, 20, 10);
    directionalLight1.castShadow = true;
    directionalLight1.shadow.mapSize.width = 2048;
    directionalLight1.shadow.mapSize.height = 2048;
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-10, 10, -10);
    scene.add(directionalLight2);

    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);

    // 無限グリッドの追加
    const grid = createInfiniteGrid();
    scene.add(grid);

    // イベントリスナー
    mountRef.current.addEventListener('mousemove', handleMouseMove);
    mountRef.current.addEventListener('click', handleClick);

    // リサイズハンドラー
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // アニメーションループ
    const animate = () => {
      requestAnimationFrame(animate);

      // レイキャスティングでホバー検出
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(
        Object.values(objectsRef.current),
        false
      );

      // 前回ホバーしていたオブジェクトをリセット
      if (hoveredObjectRef.current) {
        hoveredObjectRef.current.material.emissive.setHex(0x000000);
        hoveredObjectRef.current.scale.copy(hoveredObjectRef.current.userData.originalScale);
        document.body.style.cursor = 'default';
        hoveredObjectRef.current = null;
      }

      // 新しくホバーしたオブジェクトを設定
      if (intersects.length > 0) {
        const hoveredObject = intersects[0].object;
        if (!hoveredObject.userData.originalScale) {
          hoveredObject.userData.originalScale = hoveredObject.scale.clone();
        }
        hoveredObject.material.emissive.setHex(
          new THREE.Color(hoveredObject.userData.originalColor).getHex()
        );
        hoveredObject.material.emissiveIntensity = 0.3;
        hoveredObject.scale.multiplyScalar(1.05);
        document.body.style.cursor = 'pointer';
        hoveredObjectRef.current = hoveredObject;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current) {
        mountRef.current.removeEventListener('mousemove', handleMouseMove);
        mountRef.current.removeEventListener('click', handleClick);
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      controls.dispose();
    };
  }, [onCameraMove, onObjectClick]);

  // オブジェクトの更新
  useEffect(() => {
    if (!sceneRef.current || !cityJsonData) return;

    // 既存のオブジェクトを削除
    Object.values(objectsRef.current).forEach(obj => {
      sceneRef.current.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    });
    objectsRef.current = {};

    // 新しいオブジェクトを追加
    cityJsonData.objects?.forEach(obj => {
      const layer = getLayerFromObject(obj);
      const isVisible = visibleLayers[layer] !== false;

      if (isVisible) {
        const mesh = createCityObject(obj);
        sceneRef.current.add(mesh);
        objectsRef.current[obj.id] = mesh;
      }
    });
  }, [cityJsonData, visibleLayers]);

  return (
    <div className="scene3d-container">
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div className="scene-controls-info">
        <p>🖱️ マウス：回転 | ホイール：ズーム | 右クリック：移動</p>
      </div>
    </div>
  );
}

export default Scene3D;

