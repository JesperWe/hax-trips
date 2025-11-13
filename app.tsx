// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Map } from 'react-map-gl/maplibre';
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core';
import { DeckGL } from '@deck.gl/react';
import { PolygonLayer } from '@deck.gl/layers';
import { MVTLayer, TripsLayer } from '@deck.gl/geo-layers';
import { animate } from 'popmotion';

import type { Position, Color, Material, MapViewState } from '@deck.gl/core';

// Source data CSV
const DATA_URL = {
  BUILDINGS:
    'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/buildings.json', // eslint-disable-line
  TRIPS: 'https://raw.githubusercontent.com/visgl/deck.gl-data/master/examples/trips/trips-v7.json' // eslint-disable-line
};
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json'

const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 1.0
});

const pointLight = new PointLight({
  color: [255, 255, 255],
  intensity: 2.0,
  position: [-74.05, 40.7, 8000]
});

const lightingEffect = new LightingEffect({ ambientLight, pointLight });

type Theme = {
  buildingColor: Color;
  trailColor0: Color;
  trailColor1: Color;
  material: Material;
  effects: [LightingEffect];
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
};

const INITIAL_VIEW_STATE: MapViewState = {
  longitude: -74,
  latitude: 40.72,
  zoom: 13,
  pitch: 45,
  bearing: 0
};

const landCover: Position[][] = [
  [
    [-74.0, 40.7],
    [-74.02, 40.7],
    [-74.02, 40.72],
    [-74.0, 40.72]
  ]
];

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
  trailLength = 180,
  initialViewState = INITIAL_VIEW_STATE,
  mapStyle = MAP_STYLE,
  theme = DEFAULT_THEME,
  loopLength = 1800, // unit corresponds to the timestamp in source data
  animationSpeed = 1
}: {
  buildings?: string | Building[];
  trips?: string | Trip[];
  trailLength?: number;
  loopLength?: number;
  animationSpeed?: number;
  initialViewState?: MapViewState;
  mapStyle?: string;
  theme?: Theme;
}) {
  const [time, setTime] = useState(0);
  const [tripsData, setTripsData] = useState<Trip[]>([]);
  const [buildingsData, setBuildingsData] = useState<Building[]>([]);

  useEffect(() => {
    if (typeof trips === 'string') {
      fetch(trips)
        .then(response => response.json())
        .then(data => setTripsData(data));
    } else {
      setTripsData(trips);
    }

    if (typeof buildings === 'string') {
      fetch(buildings)
        .then(response => response.json())
        .then(data => setBuildingsData(data));
    } else {
      setBuildingsData(buildings);
    }
  }, [trips, buildings]);

  useEffect(() => {
    const animation = animate({
      from: 0,
      to: loopLength,
      duration: (loopLength * 60) / animationSpeed,
      repeat: Infinity,
      onUpdate: setTime
    });
    return () => animation.stop();
  }, [loopLength, animationSpeed]);

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
            return [255, 0, 0];
          case 'water':
            return [120, 150, 180];
          case 'building':
            return [218, 218, 218];
          default:
            return [240, 240, 240];
        }
      },
      getLineWidth: f => {
        switch (f.properties.class) {
          case 'street':
            return 6;
          case 'motorway':
            return 10;
          default:
            return 1;
        }
      },
      getLineColor: [192, 192, 192],
      getPointRadius: 0,
      pointRadiusUnits: 'pixels',
      stroked: false,
      picking: true
    }),
    // This is only needed when using shadow effects
    new PolygonLayer<Position[]>({
      id: 'ground',
      data: landCover,
      getPolygon: f => f,
      stroked: false,
      getFillColor: [0, 0, 0, 0]
    }),
    new TripsLayer<Trip>({
      id: 'trips',
      data: tripsData,
      getPath: d => d.path,
      getTimestamps: d => d.timestamps,
      getColor: d => (d.vendor === 0 ? theme.trailColor0 : theme.trailColor1),
      opacity: 0.3,
      widthMinPixels: 4,
      rounded: true,
      trailLength,
      currentTime: time,
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
  ];
  return (
    <DeckGL
      layers={layers}
      effects={theme.effects}
      initialViewState={initialViewState}
      controller={true}
    >
      <Map reuseMaps mapStyle={mapStyle} />
    </DeckGL>
  );
}

export function renderToDOM(container: HTMLDivElement) {
  createRoot(container).render(<App />);
}
