import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky';
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
  const keysPressed = useRef({});
  const cameraVelocity = useRef(new THREE.Vector3());
  const initialCameraPosition = useRef(new THREE.Vector3(20, 20, 20));
  const initialCameraRotation = useRef(new THREE.Euler());
  const centerPosition = useRef(new THREE.Vector3(0, 0, 0));
  
  // カメラ位置情報のstate
  const [cameraInfo, setCameraInfo] = useState({
    x: 20.0,
    y: 20.0,
    z: 20.0,
    roll: 0.0,
    pitch: 0.0,
    yaw: 0.0
  });

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

  // キーボード操作
  const handleKeyDown = (event) => {
    keysPressed.current[event.key.toLowerCase()] = true;
  };

  const handleKeyUp = (event) => {
    keysPressed.current[event.key.toLowerCase()] = false;
  };

  // 初期化
  useEffect(() => {
    if (!mountRef.current) return;

    // シーンの作成
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Sky.jsを使った空の作成
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    // 太陽の設定
    const sun = new THREE.Vector3();

    // Sky shaderのuniformsを設定
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 10;      // 大気の濁り（0-20）
    skyUniforms['rayleigh'].value = 2;        // レイリー散乱（0-4）
    skyUniforms['mieCoefficient'].value = 0.005;  // ミー散乱係数
    skyUniforms['mieDirectionalG'].value = 0.8;   // ミー散乱の方向性

    // 太陽の位置を設定（仰角と方位角）
    const elevation = 30;  // 仰角（度）
    const azimuth = 180;   // 方位角（度）

    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);

    sun.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(sun);

    // 霧の設定
    scene.fog = new THREE.Fog(0x87CEEB, 50, 300);

    // カメラの作成
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(20, 20, 20);
    camera.lookAt(0, 0, 0);
    initialCameraPosition.current.copy(camera.position);
    initialCameraRotation.current.copy(camera.rotation);
    cameraRef.current = camera;

    // レンダラーの作成
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // マウスドラッグでカメラ回転
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (event) => {
      if (event.button === 2) { // 右クリック
        isDragging = true;
        previousMousePosition = { x: event.clientX, y: event.clientY };
      }
    };

    const onMouseMove = (event) => {
      if (isDragging) {
        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;

        camera.rotation.y -= deltaX * 0.005;
        camera.rotation.x -= deltaY * 0.005;

        // X軸の回転を制限（真上・真下を見すぎない）
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));

        previousMousePosition = { x: event.clientX, y: event.clientY };
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

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
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

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

      // キーボード操作でカメラ移動
      const speed = keysPressed.current['shift'] ? 0.1 : 0.5; // Shiftで低速
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0);

      // W:上 S:下
      if (keysPressed.current['w']) camera.position.add(up.clone().multiplyScalar(speed));
      if (keysPressed.current['s']) camera.position.add(up.clone().multiplyScalar(-speed));

      // A:左 D:右
      if (keysPressed.current['a']) camera.position.add(right.clone().multiplyScalar(-speed));
      if (keysPressed.current['d']) camera.position.add(right.clone().multiplyScalar(speed));

      // Q:後進 E:前進
      if (keysPressed.current['q']) camera.position.add(forward.clone().multiplyScalar(-speed));
      if (keysPressed.current['e']) camera.position.add(forward.clone().multiplyScalar(speed));

      // Y:位置向き初期化
      if (keysPressed.current['y']) {
        camera.position.copy(initialCameraPosition.current);
        camera.rotation.copy(initialCameraRotation.current);
        keysPressed.current['y'] = false;
      }

      // P:向き初期化
      if (keysPressed.current['p']) {
        camera.rotation.copy(initialCameraRotation.current);
        keysPressed.current['p'] = false;
      }

      // O:位置初期化
      if (keysPressed.current['o']) {
        camera.position.copy(initialCameraPosition.current);
        keysPressed.current['o'] = false;
      }

      // L:パン北向き
      if (keysPressed.current['l']) {
        camera.rotation.y = 0;
        keysPressed.current['l'] = false;
      }

      // I:チルト水平
      if (keysPressed.current['i']) {
        camera.rotation.x = 0;
        keysPressed.current['i'] = false;
      }

      // T:チルト真下
      if (keysPressed.current['t']) {
        camera.rotation.x = Math.PI / 2;
        keysPressed.current['t'] = false;
      }

      // R:チルト水平・高さ初期値
      if (keysPressed.current['r']) {
        camera.rotation.x = 0;
        camera.position.y = initialCameraPosition.current.y;
        keysPressed.current['r'] = false;
      }

      // U:パン重心
      if (keysPressed.current['u']) {
        const direction = centerPosition.current.clone().sub(camera.position);
        const angle = Math.atan2(direction.x, direction.z);
        camera.rotation.y = angle;
        keysPressed.current['u'] = false;
      }

      // J:位置重心
      if (keysPressed.current['j']) {
        camera.position.copy(centerPosition.current);
        keysPressed.current['j'] = false;
      }

      // H:重心向き後進
      if (keysPressed.current['h']) {
        const direction = centerPosition.current.clone().sub(camera.position).normalize();
        camera.position.add(direction.multiplyScalar(-speed));
      }

      // G:重心向き前進
      if (keysPressed.current['g']) {
        const direction = centerPosition.current.clone().sub(camera.position).normalize();
        camera.position.add(direction.multiplyScalar(speed));
      }

      // K:重心真下
      if (keysPressed.current['k']) {
        camera.position.set(centerPosition.current.x, camera.position.y, centerPosition.current.z);
        keysPressed.current['k'] = false;
      }

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

      // カメラ位置情報を更新（フレームごとに更新すると重いので、適度に間引く）
      if (Math.random() < 0.1) { // 約10%の確率で更新（フレームレート間引き）
        const radToDeg = (rad) => ((rad * 180 / Math.PI) % 360).toFixed(1);
        setCameraInfo({
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          roll: radToDeg(camera.rotation.z),
          pitch: radToDeg(camera.rotation.x),
          yaw: radToDeg(camera.rotation.y)
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (mountRef.current) {
        mountRef.current.removeEventListener('mousemove', handleMouseMove);
        mountRef.current.removeEventListener('click', handleClick);
        if (renderer.domElement.parentNode === mountRef.current) {
          mountRef.current.removeChild(renderer.domElement);
        }
      }
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.dispose();
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
      <div className="camera-info-container">
        <div className="camera-position-info">
          ◆カメラ位置<br />
          座標:東西 {cameraInfo.x.toFixed(3)} 高さ {cameraInfo.y.toFixed(3)} 南北 {cameraInfo.z.toFixed(3)} [m] 向き:ロール {cameraInfo.roll} ピッチ {cameraInfo.pitch} ヨー {cameraInfo.yaw} [度]
        </div>
        <div className="camera-controls-info">
          カメラ操作<br />
          W:上 S:下 A:左 D:右 Q:後進 E:前進 右ドラッグ: 向き +左Shiftキー:低速 Y:位置向き初期化 P:向き初期化 O:位置初期化 L:パン北向き I:チルト水平 T:チルト真下 R:チルト水平・高さ初期値 U:パン重心 J:位置重心 H:重心向き後進 G:重心向き前進 K:重心真下
        </div>
      </div>
    </div>
  );
}

export default Scene3D;

