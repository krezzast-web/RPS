import React, { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';

// Error Boundary Component to gracefully catch 3D loading crashes
// and fall back to the standard emojis.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Three.js/3D Model loading failed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function Model({ url }) {
  const { scene } = useGLTF(url);
  const modelRef = useRef();

  // Clone scene so that multiple components using the same GLB do not share the exact same instance
  const clonedScene = React.useMemo(() => scene.clone(), [scene]);

  useEffect(() => {
    if (clonedScene) {
      clonedScene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // Optimize material properties for dark/neon lighting if needed
          if (child.material) {
            child.material.roughness = 0.3;
            child.material.metalness = 0.8;
          }
        }
      });
    }
  }, [clonedScene]);

  // Gentle idle animation to make hands feel alive
  useFrame((state) => {
    if (modelRef.current) {
      const time = state.clock.getElapsedTime();
      modelRef.current.position.y = Math.sin(time * 1.5) * 0.05;
      modelRef.current.rotation.x = Math.sin(time * 1.0) * 0.05;
    }
  });

  return (
    <primitive 
      ref={modelRef} 
      object={clonedScene} 
      scale={2.2} 
    />
  );
}

function Hand3DScene({ selection, isOpponent }) {
  const getModelUrl = (sel) => {
    const base = import.meta.env.BASE_URL || '/';
    // Clean trailing slash issues if any
    const normalizedBase = base.endsWith('/') ? base : base + '/';
    if (sel === 'P') return `${normalizedBase}models/Paper.glb`;
    if (sel === 'S') return `${normalizedBase}models/Scissors.glb`;
    return `${normalizedBase}models/Rock.glb`; // Default to Rock (fist) for shaking or initial state
  };

  const modelUrl = getModelUrl(selection);

  // Match point light accent color with player UI:
  // You = --color-you: #ffe27c (gold/yellow)
  // Opponent = --color-opponent: #ff85a1 (pink/red)
  const lightColor = isOpponent ? '#ff85a1' : '#ffe27c';

  return (
    <div className="hand-3d-container" style={{ width: '100%', height: '100%' }}>
      <Canvas 
        camera={{ position: [0, 0, 3.2], fov: 45 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.9} />
        
        {/* Main white highlight directional light */}
        <directionalLight 
          position={[2, 4, 3]} 
          intensity={1.5} 
          color="#ffffff" 
        />
        
        {/* Key theme glow point light */}
        <pointLight 
          position={[-3, -2, 2]} 
          intensity={4.0} 
          color={lightColor} 
        />

        <Suspense fallback={null}>
          <Center>
            {/* Mirror the opponent model and rotate to face each other */}
            <group 
              rotation={[
                0.2, // slight tilt forward for visibility
                isOpponent ? -Math.PI / 2 : Math.PI / 2, // player faces right, opponent faces left
                0
              ]}
            >
              <Model url={modelUrl} />
            </group>
          </Center>
        </Suspense>
      </Canvas>
    </div>
  );
}

export default function Hand3D({ selection, isOpponent }) {
  const getEmoji = (sel) => {
    if (sel === 'P') return '✋';
    if (sel === 'S') return '✌️';
    return '✊';
  };

  const emojiFallback = (
    <div 
      className="hand-emoji-fallback" 
      style={{ 
        fontSize: '80px', 
        lineHeight: '100px', 
        textAlign: 'center', 
        transform: isOpponent ? 'scaleX(-1)' : 'none',
        userSelect: 'none'
      }}
    >
      {getEmoji(selection)}
    </div>
  );

  return (
    <ErrorBoundary fallback={emojiFallback}>
      <Hand3DScene selection={selection} isOpponent={isOpponent} />
    </ErrorBoundary>
  );
}

// Preload the GLB files to ensure instant display during transitions
const base = import.meta.env.BASE_URL || '/';
const normalizedBase = base.endsWith('/') ? base : base + '/';
useGLTF.preload(`${normalizedBase}models/Rock.glb`);
useGLTF.preload(`${normalizedBase}models/Paper.glb`);
useGLTF.preload(`${normalizedBase}models/Scissors.glb`);