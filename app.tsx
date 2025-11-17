// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useEffect, useRef, useState } from "react"
import { createRoot } from 'react-dom/client'
import { Map as MapGL } from 'react-map-gl/maplibre'
import { AmbientLight, Color, LightingEffect, MapViewState, Material, PointLight, Position } from '@deck.gl/core'
import { DeckGL } from '@deck.gl/react'
import { PolygonLayer } from '@deck.gl/layers'
import { MVTLayer } from '@deck.gl/geo-layers'
import IconLayer from './icon-layer/icon-layer'
import { wsconnect } from "@nats-io/nats-core"

// Source data URL for buildings only
const DATA_URL = {
  BUILDINGS:
    'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/buildings.json'
}
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json'

const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 1.0
})

const pointLight = new PointLight({
  color: [255, 255, 255],
  intensity: 2.0,
  position: [-74.05, 40.7, 8000]
})

const lightingEffect = new LightingEffect({ ambientLight, pointLight })

type Theme = {
  buildingColor: Color;
  trailColor0: Color;
  trailColor1: Color;
  material: Material;
  effects: LightingEffect[];
};

const DEFAULT_THEME: Theme = {
  buildingColor: [74, 80, 87],
  trailColor0: [255, 165, 0],  // Orange for vendor 0
  trailColor1: [0, 100, 0],     // Dark green for vendor 1
  material: {
    ambient: 0.5,
    diffuse: 0.6,
    shininess: 32,
    specularColor: [60, 64, 70]
  },
  effects: [lightingEffect]
}

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: -74,
  latitude: 40.72,
  zoom: 13,
  pitch: 45,
  bearing: 0
}

const landCover: Position[][] = [
  [
    [-74.0, 40.7],
    [-74.02, 40.7],
    [-74.02, 40.72],
    [-74.0, 40.72]
  ]
]

type Building = {
  polygon: Position[];
  height: number;
};

type PositionMessage = {
  id: string;
  vendor: number;
  lat: number;
  lng: number;
  timestamp: number;
};

type TripPosition = {
  position: Position;
  vendor: number;
  id: string;
  timestamp: number;
};

type AnimatedPosition = TripPosition & {
  targetPosition?: Position;
  animationStartTime?: number;
  animationDuration?: number;
  previousPosition?: Position;
};

export default function App({
  buildings = DATA_URL.BUILDINGS,
  initialViewState = INITIAL_VIEW_STATE,
  mapStyle = MAP_STYLE,
  theme = DEFAULT_THEME,
  natsUrl = 'http://nats.hax.journeyman.se:8080'
}: {
  buildings?: string | Building[];
  initialViewState?: MapViewState;
  mapStyle?: string;
  theme?: Theme;
  natsUrl?: string;
}) {
  const [buildingsData, setBuildingsData] = useState<Building[]>([])
  const [tripPositions, setTripPositions] = useState<Map<string, TripPosition[]>>(new Map())
  const [currentPositions, setCurrentPositions] = useState<TripPosition[]>([])
  const [animatedPositions, setAnimatedPositions] = useState<Map<string, AnimatedPosition>>(new Map())
  const natsConnectionRef = useRef<any>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Load buildings data
  useEffect(() => {
    if (typeof buildings === 'string') {
      fetch(buildings)
        .then(response => response.json())
        .then(data => setBuildingsData(data))
    } else {
      setBuildingsData(buildings)
    }
  }, [buildings])

  // Connect to NATS and subscribe to positions
  useEffect(() => {
    const connectToNats = async () => {
      try {
        console.log('Connecting to NATS at', natsUrl)
        const nc = await wsconnect({ servers: natsUrl })
        natsConnectionRef.current = nc
        console.log('Connected to NATS')

        // Subscribe to positions subject
        const sub = nc.subscribe('positions')
        console.log('Subscribed to positions subject')

          // Process incoming messages
          ; (async () => {
            for await (const msg of sub) {
              try {
                const positionMsg: PositionMessage = JSON.parse(
                  new TextDecoder().decode(msg.data)
                )

                // Update trip positions and animated positions
                setTripPositions(prev => {
                  const newMap = new Map(prev)
                  const tripPositions = newMap.get(positionMsg.id) || []

                  // Add new position to the trip's timeline
                  const newPosition: TripPosition = {
                    position: [positionMsg.lng, positionMsg.lat],
                    vendor: positionMsg.vendor,
                    id: positionMsg.id,
                    timestamp: positionMsg.timestamp
                  }

                  // Keep positions sorted by timestamp
                  const updatedPositions = [...tripPositions, newPosition].sort(
                    (a, b) => a.timestamp - b.timestamp
                  )

                  newMap.set(positionMsg.id, updatedPositions)
                  return newMap
                })

                // Update animated positions
                setAnimatedPositions(prev => {
                  const newMap = new Map(prev)
                  const currentAnimated = newMap.get(positionMsg.id)

                  // Calculate animation duration based on time elapsed since last position
                  let animationDuration = 1000 // Default 1 second

                  // Get the previous position from the animated state if it exists
                  if (currentAnimated && currentAnimated.timestamp) {
                    // Use the actual time difference between positions
                    animationDuration = positionMsg.timestamp - currentAnimated.timestamp
                    // Cap the animation duration to reasonable limits (100ms to 5 seconds)
                    animationDuration = Math.max(100, Math.min(5000, animationDuration))
                  }

                  const newAnimatedPosition: AnimatedPosition = {
                    position: currentAnimated?.position || [positionMsg.lng, positionMsg.lat],
                    vendor: positionMsg.vendor,
                    id: positionMsg.id,
                    timestamp: positionMsg.timestamp,
                    targetPosition: [positionMsg.lng, positionMsg.lat],
                    animationStartTime: Date.now(),
                    animationDuration: animationDuration,
                    previousPosition: currentAnimated?.position
                  }

                  newMap.set(positionMsg.id, newAnimatedPosition)
                  return newMap
                })
              } catch (err) {
                console.error('Error processing position message:', err)
              }
            }
          })().then()
      } catch (err) {
        console.error('Error connecting to NATS:', err)
      }
    }

    connectToNats()

    // Cleanup on unmount
    return () => {
      if (natsConnectionRef.current) {
        natsConnectionRef.current.close()
      }
    }
  }, [natsUrl])

  // Animation loop for smooth position transitions
  useEffect(() => {
    const animate = () => {
      const now = Date.now()
      let needsUpdate = false

      setAnimatedPositions(prev => {
        const newMap = new Map(prev)

        prev.forEach((animatedPos, tripId) => {
          if (animatedPos.targetPosition && animatedPos.animationStartTime && animatedPos.animationDuration) {
            const elapsed = now - animatedPos.animationStartTime
            const progress = Math.min(1, elapsed / animatedPos.animationDuration)

            if (progress < 1) {
              needsUpdate = true

              // Linear interpolation between previous and target position
              const fromPos = animatedPos.previousPosition || animatedPos.position
              const toPos = animatedPos.targetPosition

              const interpolatedPosition: Position = [
                fromPos[0] + (toPos[0] - fromPos[0]) * progress,
                fromPos[1] + (toPos[1] - fromPos[1]) * progress
              ]

              newMap.set(tripId, {
                ...animatedPos,
                position: interpolatedPosition
              })
            } else {
              // Animation complete, set to final position
              newMap.set(tripId, {
                ...animatedPos,
                position: animatedPos.targetPosition,
                previousPosition: animatedPos.targetPosition,
                targetPosition: undefined,
                animationStartTime: undefined,
                animationDuration: undefined
              })
            }
          }
        })

        return newMap
      })

      if (needsUpdate) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        animationFrameRef.current = null
      }
    }

    // Start animation if there are animated positions
    if (animatedPositions.size > 0) {
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate)
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [animatedPositions])

  // Update current positions from animated positions
  useEffect(() => {
    const positions: TripPosition[] = []

    animatedPositions.forEach((animatedPos) => {
      positions.push({
        position: animatedPos.position,
        vendor: animatedPos.vendor,
        id: animatedPos.id,
        timestamp: animatedPos.timestamp
      })
    })

    setCurrentPositions(positions)
  }, [animatedPositions])


  const layers = [
    new MVTLayer({
      id: 'MVTLayer',
      data: [
        'https://tiles-a.basemaps.cartocdn.com/vectortiles/carto.streets/v1/{z}/{x}/{y}.mvt'
      ],
      minZoom: 0,
      maxZoom: 14,
      getFillColor: f => {
        switch (f.properties.layerName) {
          case 'poi':
            return [255, 0, 0]
          case 'water':
            return [120, 150, 180]
          case 'building':
            return [218, 218, 218]
          default:
            return [240, 240, 240]
        }
      },
      getLineWidth: f => {
        switch (f.properties.class) {
          case 'street':
            return 6
          case 'motorway':
            return 10
          default:
            return 1
        }
      },
      getLineColor: [192, 192, 192],
    }),
    // This is only needed when using shadow effects
    new PolygonLayer<Position[]>({
      id: 'ground',
      data: landCover,
      getPolygon: f => f,
      stroked: false,
      getFillColor: [0, 0, 0, 0]
    }),
    new IconLayer({
      id: 'trip-icons',
      data: currentPositions,
      getPosition: d => d.position,
      getColor: d => (d.vendor === 0 ? theme.trailColor0 : theme.trailColor1),
      getIcon: () => ({
        url: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-marker.png',
        width: 128,
        height: 128,
        anchorY: 128
      }),
      sizeScale: 20,
      pickable: true
    }),
    new PolygonLayer<Building>({
      id: 'buildings',
      data: buildingsData,
      extruded: true,
      wireframe: false,
      opacity: 0.5,
      getPolygon: f => f.polygon,
      getElevation: f => f.height,
      getFillColor: theme.buildingColor,
      material: theme.material
    })
  ]

  return (
    <DeckGL
      layers={layers}
      effects={theme.effects}
      initialViewState={initialViewState}
      controller={true}
    >
      <MapGL reuseMaps mapStyle={mapStyle} />
    </DeckGL>
  )
}

export function renderToDOM(container: HTMLDivElement) {
  createRoot(container).render(<App />)
}
