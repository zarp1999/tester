import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SkyComponent from './SkyComponent';
import './ExtrusionTest.css';

/**
 * 押し出し図形テストコンポーネント
 * 以下の組み合わせをテスト：
 * - パス: 折れ線、スプライン
 * - 断面: 円、楕円、矩形、ポリゴン
 */
function ExtrusionTest() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const skyComponentRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // シーンの初期化
    const scene = new THREE.Scene();
    scene.background = null; // SkyComponentが描画する
    sceneRef.current = scene;

    // フォグを追加して深度感を出す
    // scene.fog = new THREE.Fog(0x8B7355, 20, 100);

    // カメラの設定
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(30, 30, 30);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // レンダラーの設定
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance"
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // トーンマッピング設定
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // コントロールの設定
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // ライトの追加
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 20, 20);
    scene.add(directionalLight);

    // グリッドの追加
    const floorGeometry = new THREE.PlaneGeometry(2000, 2000);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: '#d0d0d0',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      roughness: 0.5
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // 軸ヘルパーの追加
    const axesHelper = new THREE.AxesHelper(10);
    scene.add(axesHelper);

    // Sky コンポーネントの初期化
    const skyComponent = new SkyComponent(scene, renderer, mountRef.current);
    skyComponentRef.current = skyComponent;

    // パス作成関数
    const createPath = (points, isSpline = false) => {
      return new THREE.CatmullRomCurve3(points, isSpline);
    };

    // 断面形状作成関数
    const createCircleShape = (radius) => {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
      return shape;
    };

    const createEllipseShape = (radiusX, radiusY) => {
      const shape = new THREE.Shape();
      shape.absellipse(0, 0, radiusX, radiusY, 0, Math.PI * 2, false, 0);
      return shape;
    };

    const createRectangleShape = (width, height) => {
      const shape = new THREE.Shape();
      shape.moveTo(-width / 2, -height / 2);
      shape.lineTo(width / 2, -height / 2);
      shape.lineTo(width / 2, height / 2);
      shape.lineTo(-width / 2, height / 2);
      shape.lineTo(-width / 2, -height / 2);
      return shape;
    };

    const createPolygonShape = (sides = 6, radius = 1) => {
      const shape = new THREE.Shape();
      const vertices = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        vertices.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }
      shape.moveTo(vertices[0][0], vertices[0][1]);
      for (let i = 1; i < vertices.length; i++) {
        shape.lineTo(vertices[i][0], vertices[i][1]);
      }
      shape.lineTo(vertices[0][0], vertices[0][1]);
      return shape;
    };

    // 押し出し図形作成関数
    const createExtrudedShape = (path, shape, color, position) => {
      const extrudeSettings = {
        steps: 100,
        bevelEnabled: false,
        extrudePath: path
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const material = new THREE.MeshPhongMaterial({ 
        color: color,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      return mesh;
    };

    // ラベル作成関数
    const createLabel = (text, position, color = 0xffffff) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 512;
      canvas.height = 128;
      
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = color;
      context.font = 'Bold 48px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, canvas.width / 2, canvas.height / 2);
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(4, 1, 1);
      sprite.position.copy(position);
      return sprite;
    };

    // テストケースの定義
    const testCases = [
      // 折れ線 × 円
      {
        name: '折れ線 × 円',
        path: createPath([
          new THREE.Vector3(-10, 0, -10),
          new THREE.Vector3(-5, 5, 0),
          new THREE.Vector3(0, 0, 10),
          new THREE.Vector3(5, -5, 0)
        ], false),
        shape: createCircleShape(0.5),
        color: 0xff0000,
        position: new THREE.Vector3(-20, 0, -20)
      },
      // 折れ線 × 楕円
      {
        name: '折れ線 × 楕円',
        path: createPath([
          new THREE.Vector3(-10, 0, -10),
          new THREE.Vector3(-5, 5, 0),
          new THREE.Vector3(0, 0, 10),
          new THREE.Vector3(5, -5, 0)
        ], false),
        shape: createEllipseShape(0.8, 0.4),
        color: 0x00ff00,
        position: new THREE.Vector3(-20, 0, 0)
      },
      // 折れ線 × 矩形
      {
        name: '折れ線 × 矩形',
        path: createPath([
          new THREE.Vector3(-10, 0, -10),
          new THREE.Vector3(-5, 5, 0),
          new THREE.Vector3(0, 0, 10),
          new THREE.Vector3(5, -5, 0)
        ], false),
        shape: createRectangleShape(1, 0.6),
        color: 0x0000ff,
        position: new THREE.Vector3(-20, 0, 20)
      },
      // 折れ線 × ポリゴン
      {
        name: '折れ線 × ポリゴン',
        path: createPath([
          new THREE.Vector3(-10, 0, -10),
          new THREE.Vector3(-5, 5, 0),
          new THREE.Vector3(0, 0, 10),
          new THREE.Vector3(5, -5, 0)
        ], false),
        shape: createPolygonShape(6, 0.5),
        color: 0xffff00,
        position: new THREE.Vector3(-20, 0, 40)
      },
      // スプライン × 円
      {
        name: 'スプライン × 円',
        path: createPath([
          new THREE.Vector3(10, 0, -10),
          new THREE.Vector3(15, 5, 0),
          new THREE.Vector3(20, 0, 10),
          new THREE.Vector3(15, -5, 0),
          new THREE.Vector3(10, 0, 10)
        ], true),
        shape: createCircleShape(0.5),
        color: 0xff00ff,
        position: new THREE.Vector3(20, 0, -20)
      },
      // スプライン × 楕円
      {
        name: 'スプライン × 楕円',
        path: createPath([
          new THREE.Vector3(10, 0, -10),
          new THREE.Vector3(15, 5, 0),
          new THREE.Vector3(20, 0, 10),
          new THREE.Vector3(15, -5, 0),
          new THREE.Vector3(10, 0, 10)
        ], true),
        shape: createEllipseShape(0.8, 0.4),
        color: 0x00ffff,
        position: new THREE.Vector3(20, 0, 0)
      },
      // スプライン × 矩形
      {
        name: 'スプライン × 矩形',
        path: createPath([
          new THREE.Vector3(10, 0, -10),
          new THREE.Vector3(15, 5, 0),
          new THREE.Vector3(20, 0, 10),
          new THREE.Vector3(15, -5, 0),
          new THREE.Vector3(10, 0, 10)
        ], true),
        shape: createRectangleShape(1, 0.6),
        color: 0xff8800,
        position: new THREE.Vector3(20, 0, 20)
      },
      // スプライン × ポリゴン
      {
        name: 'スプライン × ポリゴン',
        path: createPath([
          new THREE.Vector3(10, 0, -10),
          new THREE.Vector3(15, 5, 0),
          new THREE.Vector3(20, 0, 10),
          new THREE.Vector3(15, -5, 0),
          new THREE.Vector3(10, 0, 10)
        ], true),
        shape: createPolygonShape(6, 0.5),
        color: 0x88ff00,
        position: new THREE.Vector3(20, 0, 40)
      }
    ];

    // テストケースをシーンに追加
    testCases.forEach((testCase, index) => {
      const mesh = createExtrudedShape(
        testCase.path,
        testCase.shape,
        testCase.color,
        testCase.position
      );
      scene.add(mesh);

      // ラベルの位置（図形の上）
      const labelPosition = testCase.position.clone();
      labelPosition.y += 5;
      const label = createLabel(testCase.name, labelPosition, testCase.color);
      scene.add(label);

      // パスを可視化（デバッグ用）
      const pathPoints = testCase.path.getPoints(50);
      const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
      const pathMaterial = new THREE.LineBasicMaterial({ 
        color: testCase.color,
        opacity: 0.3,
        transparent: true
      });
      const pathLine = new THREE.Line(pathGeometry, pathMaterial);
      scene.add(pathLine);
    });

    // アニメーションループ
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // リサイズハンドラー
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (skyComponentRef.current) {
        skyComponentRef.current.dispose();
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    };
  }, []);

  return (
    <div className="extrusion-test-container">
      <div className="extrusion-test-info">
        <h2>押し出し図形テスト</h2>
        <p>全ての組み合わせ（8パターン）を表示</p>
        <div className="test-cases-info">
          <div className="test-case-item">
            <span className="color-indicator" style={{ backgroundColor: '#ff0000' }}></span>
            <span>折れ線 × 円</span>
          </div>
          <div className="test-case-item">
            <span className="color-indicator" style={{ backgroundColor: '#00ff00' }}></span>
            <span>折れ線 × 楕円</span>
          </div>
          <div className="test-case-item">
            <span className="color-indicator" style={{ backgroundColor: '#0000ff' }}></span>
            <span>折れ線 × 矩形</span>
          </div>
          <div className="test-case-item">
            <span className="color-indicator" style={{ backgroundColor: '#ffff00' }}></span>
            <span>折れ線 × ポリゴン</span>
          </div>
          <div className="test-case-item">
            <span className="color-indicator" style={{ backgroundColor: '#ff00ff' }}></span>
            <span>スプライン × 円</span>
          </div>
          <div className="test-case-item">
            <span className="color-indicator" style={{ backgroundColor: '#00ffff' }}></span>
            <span>スプライン × 楕円</span>
          </div>
          <div className="test-case-item">
            <span className="color-indicator" style={{ backgroundColor: '#ff8800' }}></span>
            <span>スプライン × 矩形</span>
          </div>
          <div className="test-case-item">
            <span className="color-indicator" style={{ backgroundColor: '#88ff00' }}></span>
            <span>スプライン × ポリゴン</span>
          </div>
        </div>
      </div>
      <div ref={mountRef} className="extrusion-test-canvas" />
    </div>
  );
}

export default ExtrusionTest;

