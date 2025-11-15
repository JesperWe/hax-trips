// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from "react"
import {useEffect, useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Map} from 'react-map-gl/maplibre'
import {AmbientLight, Color, LightingEffect, MapViewState, Material, PointLight, Position} from '@deck.gl/core'
import {DeckGL} from '@deck.gl/react'
import {PolygonLayer} from '@deck.gl/layers'
import {MVTLayer} from '@deck.gl/geo-layers'
import {animate} from 'popmotion'
import IconLayer from './icon-layer/icon-layer'

// Source data CSV
const DATA_URL = {
  BUILDINGS:
    'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/buildings.json',
  TRIPS: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/trips-v7.json'
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
  trailColor0: [253, 128, 93],
  trailColor1: [23, 184, 190],
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

type Trip = {
  vendor: number;
  path: Position[];
  timestamps: number[];
};

export default function App({
  buildings = DATA_URL.BUILDINGS,
  trips = DATA_URL.TRIPS,
  initialViewState = INITIAL_VIEW_STATE,
  mapStyle = MAP_STYLE,
  theme = DEFAULT_THEME,
  loopLength = 1800, // unit corresponds to the timestamp in source data
  animationSpeed = 1
}: {
  buildings?: string | Building[];
  trips?: string | Trip[];
  loopLength?: number;
  animationSpeed?: number;
  initialViewState?: MapViewState;
  mapStyle?: string;
  theme?: Theme;
}) {
  const [time, setTime] = useState(0)
  const [tripsData, setTripsData] = useState<Trip[]>([])
  const [buildingsData, setBuildingsData] = useState<Building[]>([])

  useEffect(() => {
    if (typeof trips === 'string') {
      fetch(trips)
        .then(response => response.json())
        .then(data => setTripsData(data))
    } else {
      setTripsData(trips)
    }

    if (typeof buildings === 'string') {
      fetch(buildings)
        .then(response => response.json())
        .then(data => setBuildingsData(data))
    } else {
      setBuildingsData(buildings)
    }
  }, [trips, buildings])

  // Calculate current positions for all trips based on current time
  const getCurrentPositions = () => {
    return tripsData.map(trip => {
      const { timestamps, path } = trip

      // Find the current segment based on time
      let segmentIndex = 0
      for (let i = 0; i < timestamps.length - 1; i++) {
        if (time >= timestamps[i] && time <= timestamps[i + 1]) {
          segmentIndex = i
          break
        } else if (time > timestamps[timestamps.length - 1]) {
          // If time is past the end, use the last position
          segmentIndex = timestamps.length - 1
        }
      }

      // If we're at the last timestamp or beyond, return the last position
      if (segmentIndex >= timestamps.length - 1) {
        return {
          position: path[path.length - 1],
          vendor: trip.vendor
        }
      }

      // Interpolate between two positions
      const t0 = timestamps[segmentIndex]
      const t1 = timestamps[segmentIndex + 1]
      const ratio = (time - t0) / (t1 - t0)

      const p0 = path[segmentIndex]
      const p1 = path[segmentIndex + 1]

      const interpolatedPosition: Position = [
        p0[0] + (p1[0] - p0[0]) * ratio,
        p0[1] + (p1[1] - p0[1]) * ratio,
        p0[2] !== undefined && p1[2] !== undefined ? p0[2] + (p1[2] - p0[2]) * ratio : 0
      ]

      return {
        position: interpolatedPosition,
        vendor: trip.vendor
      }
    })
  }

  useEffect(() => {
    const animation = animate({
      from: 0,
      to: loopLength,
      duration: (loopLength * 60) / animationSpeed,
      repeat: Infinity,
      onUpdate: setTime
    })
    return () => animation.stop()
  }, [loopLength, animationSpeed])

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
      data: getCurrentPositions(),
      getPosition: d => d.position,
      getColor: d => (d.vendor === 0 ? theme.trailColor0 : theme.trailColor1),
      getIcon: () => ({
        url: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/website/icon-marker.png',
        width: 128,
        height: 128,
        anchorY: 128
      }),
      sizeScale: 8,
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
      <Map reuseMaps mapStyle={mapStyle} />
    </DeckGL>
  )
}

export function renderToDOM(container: HTMLDivElement) {
  createRoot(container).render(<App />)
}
