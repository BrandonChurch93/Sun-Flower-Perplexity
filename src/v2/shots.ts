import { barTime } from './clock.ts'

// A fixed camera for looking at the sky and the place without the plant. `film` is the camera of the film at that moment.
export interface FixedView { azimuthDeg: number; distanceM: number; heightM: number; headingDeg: number; pitchDeg: number; focalMm: number; focusM: number; fNumber: number }
export type ViewName = 'film' | 'low' | 'wide' | 'up' | 'west' | 'crane' | 'puddle'

export const views: Record<Exclude<ViewName, 'film'>, FixedView> = {
  // The seedling's camera: on the soil, looking a little up, toward where the sun rises.
  low: { azimuthDeg: 5, distanceM: 0.3, heightM: 0.05, headingDeg: 185, pitchDeg: 6, focalMm: 45, focusM: 0.3, fNumber: 4 },
  // The climb: chest high, looking up past the plant.
  up: { azimuthDeg: 10, distanceM: 0.9, heightM: 1.0, headingDeg: 192, pitchDeg: 32, focalMm: 24, focusM: 1000, fNumber: 8 },
  // The storm hold as the film frames it: standing back and low, the whole plant in frame, the horizon at six tenths of the height.
  wide: { azimuthDeg: 8, distanceM: 2.4, heightM: 0.28, headingDeg: 194, pitchDeg: 4, focalMm: 38, focusM: 2.4, fNumber: 5.6 },
  // The bloom as the film frames it: head high, the setting sun in the left third of the frame.
  west: { azimuthDeg: 19.5, distanceM: 0.89, heightM: 1.67, headingDeg: 206, pitchDeg: -1.5, focalMm: 35, focusM: 0.89, fNumber: 4 },
  // The end of the crane as the film frames it: over the field, the setting sun in the left third.
  crane: { azimuthDeg: 23.4, distanceM: 7, heightM: 4, headingDeg: 204, pitchDeg: -10, focalMm: 24, focusM: 40, fNumber: 8 },
  // Not a camera of the film: close and looking down at the wet soil in front of the plant, for judging water.
  puddle: { azimuthDeg: 18, distanceM: 1.25, heightM: 0.3, headingDeg: 199, pitchDeg: -9, focalMm: 38, focusM: 1.25, fNumber: 5.6 },
}

export interface Shot { id: string; seconds: number; view: ViewName; what: string }

const bar = (b: number): number => barTime(b)

// The moments of the film a sky is judged on, in film order.
export const shots: Shot[] = [
  { id: '01-open', seconds: 0, view: 'low', what: 'frame 0: blue hour, the sun 5 degrees under the horizon, a glow where it will rise' },
  { id: '02-first-light', seconds: bar(1.25), view: 'low', what: 'the first sunrise: the disc 1 degree up, right of centre' },
  { id: '03-morning', seconds: 2.8, view: 'up', what: 'the sun 20 degrees up in a fair sky with small cumulus' },
  { id: '04-noon', seconds: bar(3.1), view: 'up', what: 'high sun, deep blue above, cumulus' },
  { id: '05-sunset', seconds: bar(4.33), view: 'low', what: 'the first sunset: the sun 5 degrees up, left of centre' },
  { id: '06-night', seconds: bar(4.74), view: 'low', what: 'the quick night: stars, and the moon 13 degrees up at the right of the frame' },
  { id: '07-frost', seconds: bar(21), view: 'low', what: 'the frost morning: a low sun through thick mist' },
  { id: '08-lapse', seconds: bar(29.29), view: 'wide', what: 'time lapse at full speed: racing cumulus, sun 17 degrees up' },
  { id: '09-front', seconds: bar(32.5), view: 'wide', what: 'the storm front closing the sky' },
  { id: '10-storm', seconds: bar(35), view: 'wide', what: 'the storm: a closed dark deck, rain veils' },
  { id: '11-flash', seconds: bar(37) + 1 / 30, view: 'wide', what: 'lightning inside the cloud' },
  { id: '12-break', seconds: bar(41.25), view: 'wide', what: 'the deck tears open and the sun breaks through' },
  { id: '13-evening', seconds: bar(44.34), view: 'wide', what: 'a time lapse evening: the sun 7 degrees up on the left, lit cloud undersides' },
  { id: '14-bloom', seconds: bar(61), view: 'west', what: 'the bloom: golden sun 5 degrees up, in the left third of the frame' },
  { id: '15-field', seconds: bar(69), view: 'crane', what: 'the field: sun 1.5 degrees up over the far land' },
  { id: '16-last', seconds: bar(73.5), view: 'crane', what: 'last light: the sun just gone, afterglow' },
]

export function shotById(id: string): Shot {
  const s = shots.find((x) => x.id === id || x.id.slice(3) === id)
  if (!s) throw new Error(`unknown shot "${id}"`)
  return s
}
