import type { Part } from '../v2/api.ts'
import { fieldNow } from './index.ts'

// The field is laid out by the film before the frame's view is known. This part hands it the quality of the frame, before anything is drawn,
// and the renderer, which a film that is played needs for the gusts of the last shot.
export function make(): Part[] {
  return [
    {
      objects: [],
      async load(renderer) {
        fieldNow()?.card(renderer)
      },
      warm() {
        fieldNow()?.warm()
      },
      prepare(_now, _later, view) {
        fieldNow()?.use(view.quality)
      },
    },
  ]
}
