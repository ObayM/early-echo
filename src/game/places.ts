import type { Air, Vec } from '../lab/model'

export type PlaceKey = 'station' | 'earth' | 'moon' | 'mars'

const RISE = 0.5

export interface Place {
  key: PlaceKey
  name: string
  line: string
  g: number
  air: Air
  airName: string
  flow: Vec
  mix?: number
  real: string[]
  drawn: string[]
}

const rise = (g: number): Vec => [0, RISE * Math.sqrt(g), 0]
const SMOOTH = 0.0003

export const PLACES: Record<PlaceKey, Place> = {
  station: {
    key: 'station',
    name: 'Space station',
    line: 'No up or down. Hot air does not rise.',
    g: 0,
    air: { o2: 0.21, p: 1, dil: 'N2' },
    airName: 'Sea-level air, which the station keeps',
    flow: [0.1, 0, 0],
    real: [
      "The room is NASA's own 3D model of the US Lab.",
      'Every flame you light replays one of NASA\'s droplet tests: its size, fuel, how long it burned and how it ended.',
      'Cabin air moves at 8 to 20 cm a second (NASA). Here it is 10.',
    ],
    drawn: ['NASA burned its droplets in a sealed chamber, never loose in the lab.', 'The four laptops and where they hang are our own layout.', 'The flame is drawn 3 times its size so you can see it.', 'The sound timing is our estimate.'],
  },
  earth: {
    key: 'earth',
    name: 'Earth',
    line: 'Hot air rises, so a flame stands up and smoke reaches the ceiling.',
    g: 1,
    air: { o2: 0.21, p: 1, dil: 'N2' },
    airName: 'Room air',
    flow: rise(1),
    mix: SMOOTH,
    real: ['Our own test with a real candle: a soundbar sends sound to a laptop\'s microphones, with a candle under the line, lit and put out 3 times.', 'The room is the size we measured from its own echoes: 4.60 by 3.41 by 3.04 m.', 'The sound arrived 3.2 millionths of a second earlier with the flame lit. One fixed threshold was right on 115 of 117 seconds.'],
    drawn: ['The table and the candle are stand-ins, and where the table stands in the room is a guess.', 'The reading here is our estimate, not the recording. The recording is on the Sound alarm page.'],
  },
  moon: {
    key: 'moon',
    name: 'Moon',
    line: 'One sixth of Earth\'s gravity, and no air outside.',
    g: 0.166,
    air: { o2: 0.34, p: 0.558, dil: 'N2' },
    airName: 'Planned habitat air: 34% oxygen at 8.2 psi',
    flow: rise(0.166),
    mix: SMOOTH,
    real: [
      'Outside there is no air, so nothing can burn. A fire can only happen inside, in the air people bring.',
      "NASA's planned habitat air has more oxygen (34%) at lower pressure (8.2 psi).",
      'The flame replays the nearest NASA droplet test to the air you set. NASA ran those in weightlessness.',
    ],
    drawn: ['Nobody has lit a fire on the Moon. How the flame leans under Moon gravity is drawn, not measured.', 'The habitat dome and the laptops in it are made up, and the flame is drawn 3 times its size.', 'How fast the warm air rises is scaled from Earth by gravity. The timing is our estimate.'],
  },
  mars: {
    key: 'mars',
    name: 'Mars',
    line: 'Three eighths of Earth\'s gravity. The air outside is thin carbon dioxide.',
    g: 0.378,
    air: { o2: 0.34, p: 0.558, dil: 'N2' },
    airName: 'Planned habitat air: 34% oxygen at 8.2 psi',
    flow: rise(0.378),
    mix: SMOOTH,
    real: [
      'The air outside is under 1% of Earth\'s pressure and almost all carbon dioxide, so nothing burns out there.',
      "NASA's planned habitat air has more oxygen (34%) at lower pressure (8.2 psi).",
      'The flame replays the nearest NASA droplet test to the air you set. NASA ran those in weightlessness.',
    ],
    drawn: ['Nobody has lit a fire on Mars. How the flame leans under Mars gravity is drawn, not measured.', 'The habitat dome and the laptops in it are made up, and the flame is drawn 3 times its size.', 'How fast the warm air rises is scaled from Earth by gravity. The timing is our estimate.'],
  },
}

export const ORDER: PlaceKey[] = ['station', 'earth', 'moon', 'mars']

export const lean = (g: number) => (g <= 0 ? 0 : g ** 0.45)
