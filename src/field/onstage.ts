import type { Part } from '../v2/api.ts'
import { fieldNow } from './index.ts'

// The field is laid out by the film before the frame's view is known. This part hands it the quality of the frame, before anything is drawn.
export function make(): Part[] {
  return [
    {
      objects: [],
      prepare(_now, _later, view) {
        fieldNow()?.use(view.quality)
      },
    },
  ]
}
