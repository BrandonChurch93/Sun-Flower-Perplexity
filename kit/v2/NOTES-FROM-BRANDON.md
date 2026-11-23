# Notes from Brandon, version 2

His words, exactly as he wrote them in the task thread. They beat the kit on their own topics.

## 22 November 2026, about 18:34 UTC (the brief for version 2)

> I think we're going to need to slightly overhaul this. Let's hold off on making changes for now. I'd like for you to make a plan and present that plan to me once approved then we can start building.
>
> The issue I have is that the flower essentially keeps growing throughout the whole film. That's not exactly what I wanted for the rainy, frosty scenes the flower should not be growing. Let me give you a better example as a whole picture of what I was thinking.
>
> I was thinking we have like a time lapse of the sunflower growing during its grow stages. It goes from day tonight in the sky repeatedly while it's actually growing, no more hard cuts. Then the rainy scene and the frosty scene come in at various points in between these grow cycles and we get to just take in the flower with with the rain hitting it or the flower with the frost on it and then that will go away and then we have another gross cycle so it shouldn't be growin during those stages. It just looks weird and also we shouldn't have a super long night stage either because it looks weird that the sunflower is growing at night. It's OK if it's growing at night during the time lapse because it will be switching between day and night pretty fast. I know this is a pretty significant overhaul. This means we probably have to do a whole new sky system. We can reuse what we can from the video, but we have to create new scenes most likely obviously the most important thing here is quality.
>
> One thing I did notice from this video is whenever there's a scene chain. We have a huge frame rate drop. It will go down to like one or two frames a second when it switches the backgrounds or scenes and then it comes back and runs pretty well we need to make sure that doesn't happen in the second iteration.
>
> Hopefully, I explained all that pretty clear if you could go into plan mode present to me the plan and what you'd recommend
>
> Obviously, because this changes slightly, and we're not doing the hard cuts, we may have to increase the length of the video which is absolutely fine. I've attached the music track. This music track will be the one I use when I actually record the video. You don't have to bundle it in with the output, but what I want you to do is go through that audio. Try to figure out where all the beats are in the cuts and stuff that way you can time up the impactful moments of the video with the audio clip that way it feels like one cohesive piece instead of this music behind a video

## 22 November 2026, about 22:00 UTC (the go-ahead to build)

> The timing looks great!
>
> What's your plan with the quality references ? I'd want the quality to at least look as good as the original video. Do we need to do new image generations, or do you think you have enough references now to build it start to finish?
>
> If you think new image generations are needed, you can go ahead and generate them now as references. If not. You're welcome to go ahead and start building, start to finish. If you do need to build the image generation, go ahead and generate them now once you've approved the quality, you can go ahead and start building start to finish.

## 23 November 2026, about 06:07 UTC (close shots in the frost, a push in on the bloom)

> Where the frost section, I think it would look really good if we got some zoomed in shots of our sunflowers showing the crystallization on various parts of it, I also think on the scene before the last one, when the bloom happens, it would be awesome if the camera zooms in on the actual sunflower, showing the bloom happen, and then it will start backing out for the final shot, revealing the whole field
>
> Please take your time in planning this update — make sure that the camera angles on frost are really good and show the best parts of the flower. You want to see like frost glistening in the sunlight and just the high detail on it. Period. I'm 50-50 when it comes to the camera actually zooming into the spot or like hard cuts time to the music. I'm leaning more towards like hard cuts on the music, but I don't know what the part of that soundtrack looks like there. So I'm gonna leave that up to your call what you think would be the best. Go ahead and add that into the current plan and keep working until everything is in the pipeline is finished

## 23 November 2026, about 21:19 UTC (the sign off; a still, a clip, a second version, the site)

> This is honestly great! I watched the video multiple times and you have my signed off on it. There's two more deliverables that I need a screenshot that is of the sunflower right before it fully blooms and opens up and then I need a 6 to 9 second video of it opening up
>
> These will be used on my portfolio, essentially on the project card. It will be the unblown sunflower, and the users cover it. The video will play from that exact moment the screenshots taking of it opening up I think that will look really good.
>
> I also need a second version of this video. Keep the video of the exact same just add the skill to show the prompt being written and the generation make sure that the prompt shows the reasoning being cut up to Max. You don't have to like change the audio or even add the audio to those first sections with the skill being voted we can keep those silent if you want you could utilize 11 labs for like typing sound effects to correspond with the letters being typed or even click sound effects for changing the reasoning and submitting that's your call.
>
> Go ahead and add this to the plan and work until it's finished and give me all the deliverables and make sure that they giithub repo plays the video when users visit the site so I can host it on VERCEL

## How these were read

- "The timing looks great" settles the timing of `kit/v2/PLAN.md`, the 140 BPM grid and its click track included.
- The defaults of the plan's decision table stand: 2:07.0, frost first and the storm second, a live recording with the frame by frame export as the second master, new reference pictures.
- "Start building, start to finish" replaces the two review stops of the plan. The build runs straight through with status pictures. He can steer at any time.
- The new reference pictures are approved by the Builder, as he asked. They are taste and layout targets for the new states. The eight pictures he approved stay the first authority.
- The bar: version 2 looks at least as good as version 1 in every state, and nothing is prepared during playback.
- The message of 23 November adds two things to the film and takes nothing away. It was read like this:
  - The frost hold is cut. MEASURED from `config/music/map.json`: bars 17 to 25 have no drums, and the downbeats of bars 19, 21, 23 and 25 are the only marks in them (levels -17.1, -11.6, -17.3 and -10.7 dB; bar 21 carries a soft low hit). A move from the wide shot into a leaf and back out three times would take most of the eight bars and leave no time to look. So: hard cuts on those four downbeats, frames 952, 1055, 1157 and 1260, and inside each close shot a slow drift, never a still frame. These are the only cuts of the film.
  - Three close shots of two bars (3.43 s) each, all looking toward the sun as the wide shot does: the edge of a leaf with the needles of ice still growing, cold, the dim sun behind it (bars 19 to 21); the growing tip and the furred stem at the moment the sun comes through, on the soft hit of bar 21 (bars 21 to 23); the thaw on one leaf, ice to beads and one drop that falls (bars 23 to 25). The picture cuts back to the wide shot on bar 25 as the plant starts to grow again.
  - Changed at 08:20 UTC the same day, after the first angle was drawn and judged (the leaf was seen edge on, the sun hid behind another leaf and half the frame was empty): the first close shot now looks down on the upper face of a leaf, three quarters from above, its tip to the left and the frozen ground soft behind it. It shows the most ice of any angle tried (22 were drawn): the face, the veins and the needles along the edge together. No sun is in its frame; the sun enters the film's close shots on the cut of bar 21.
  - "Frost glistening in the sunlight and the high detail on it" is the bar for those shots: single crystals that hold when the frame is 6 cm wide, glints that are points in focus and soft discs out of it, light through the ice. Three new reference pictures set it (`references/v2/keys/frost-margin.png`, `frost-sun.png`, `frost-thaw.png`), approved by the Builder as he allowed on 22 November.
  - The bloom is one unbroken move, no cut: the camera pushes in over bars 55 to 57 and is close on the bud when it starts to open on the loudest bar of the track (57), stays close while it opens (57 to 61) and while it stands open (61 to 65), and pulls back from the kick on bar 65 into the crane over the field.
  - "Keep working until everything in the pipeline is finished" confirms the run without review stops.
- The message of 23 November, 21:19 UTC, signs the film off and adds four things. It was read like this:
  - "You have my signed off on it" settles the film: the frozen build `9c62c3b3b10c7180`, drawn at one sample a frame, with his track, as he watched it. No pixel of it changes after this.
  - The still is the bud "right before it fully blooms and opens up": frame 2905, the stillest frame before the bud starts to open on bar 57 (frame 2907; MEASURED on the film's frames). "The users cover it" is read as "hover it".
  - The clip starts on that same frame, as he says, and runs to the bar line where the flower stands open: frames 2905 to 3112, 208 frames, 6.93 s, inside his 6 to 9 s. Both are drawn again from the frozen commit at the export tier, 48 samples a frame, because a picture on a card is looked at longer than a film frame, and both at one tier, because a still and a clip at different tiers would jump when the clip starts. The film itself is not drawn again.
  - The second version is the film exactly as signed off (its video stream copied, proven frame by frame) behind an opening made with the interface skill he names: the prompt typed, the reasoning set to Max, sent, the build screen, then a hard cut to the film where his track starts. The opening's interface is synthetic and is said to be so. Sounds in the opening are the Builder's call; a copy with a silent opening is delivered beside it.
  - "Add this to the plan": `kit/v2/PLAN.md`, "Changes since approval".
  - "Make sure the GitHub repo plays the video when users visit the site so I can host it on Vercel": the page a visitor lands on plays the film, the live version is one link away, the repository builds on Vercel without settings, and `v2` is merged into `main`.
  - The track and the repository: the approved plan says the track is never bundled and the repository holds only the map. That line stands until he says otherwise, so the film committed for the site is silent, the same encode with his track is handed to him as a file, and he is asked which one the site should play.
  - "Work until it's finished": no stop for a review. The added work is logged from 21:19 UTC and bounded the way the kit bounds an extension, at 8 hours. If the clock of the 30 hour box prints its report first, the report goes into the log and the final message and the work in hand is finished.
