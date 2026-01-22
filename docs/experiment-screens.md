# Experiment Screens Documentation

Complete documentation of every screen in the experiment, what the participant sees, and what advances it.

## Screen Flow Summary

| Phase | Screen | Task Name | Advances With |
|-------|--------|-----------|---------------|
| **Setup** | | | |
| | Preload | `preload` | Automatic |
| | PID Entry | `pid_entry` | **Enter** key |
| | PID Transition | `pid_transition` | Automatic (100ms) |
| | PID Confirmation | `pid_confirmation` | **Enter** (confirm) or **N** (re-enter) |
| **Equipment** | | | |
| | Audio Test | `audio_test` | **Continue** button |
| | Dial Calibration | `dial_calibration` | **Enter** key (dial click) (dial click) |
| | Dial Test | `dial_test` | **M** key (RA only) |
| **Instructions** | | | |
| | Study Overview | `study_overview` | **Enter** key (dial click) |
| | Dial Calibration 2 | `dial_calibration` | **Enter** key (dial click) |
| | Dial Instructions | `dial_instructions` | **Enter** key (dial click) |
| **Nature Practice** | | | |
| | Nature Instructions | `nature_instructions` | **M** key (RA only) |
| | Nature Video + Dial | `nature_video_dial` | Auto when video ends |
| | Arousal Rating | `rating_arousal` | **Enter** key (dial click) |
| | Pleasure Rating | `rating_pleasure` | **Enter** key (dial click) |
| | Distraction Rating | `rating_distraction` | **Enter** key (dial click) |
| | Immersion Rating | `rating_immersion` | **Enter** key (dial click) |
| **Per Block (x3)** | | | |
| | Audio Intro | `audio_intro` | Automatic (3s) |
| | Audio Play | `audio_play` | Auto when audio ends, **R** to skip |
| | RA Wait | `ra_wait` | **M** key (RA), **R** to replay |
| | Practice Intro | `practice_intro` | **Enter** key (dial click) |
| | Practice Video | `practice_video` | Auto when video ends |
| | Practice Ratings (x4) | `rating_*` | **Enter** key (dial click) |
| | Condition Instructions | `condition_instructions` | **R** key or auto (45s) |
| | **Per Video (x6)** | | |
| | Video + Dial | `video_dial_rating` | Auto when video ends |
| | Video Ratings (x4) | `rating_*` | **Enter** key (dial click) |
| | Break (after blocks 1,2) | `break_slide` | **M** key (RA only) |
| **End** | | | |
| | End Screen | `end_screen` | **Enter** key (dial click) |

## Key Summary

| Key | Purpose |
|-----|---------|
| **Enter** | Dial click (advance screens), PID entry, PID confirmation |
| **N** | Re-enter PID (on confirmation screen) |
| **R** | Skip audio/video, replay audio |
| **M** | RA-only screens (dial test, nature instructions, RA wait, breaks) |
| **Escape** | Skip trial (RA) |
| **Continue button** | Audio test (on-screen button) |

## Screens Requiring Monitor/RA Action

These screens will **not advance automatically** and require the RA to press a button on the monitor dashboard:

| Screen | Task Name | Monitor Button | Key Sent | When to Press |
|--------|-----------|----------------|----------|---------------|
| Dial Test | `dial_test` | **Continue** | M | When RA confirms dial is working correctly |
| Nature Instructions | `nature_instructions` | **Continue** | M | When participant is ready to start practice |
| RA Wait (x3 blocks) | `ra_wait` | **Continue** | M | After answering participant questions |
| Break (x2) | `break_slide` | **Continue** | M | When break time is over |

### Monitor Button Locations

- **Dial Test Continue**: Appears next to "Equipment Setup" in the timeline
- **Nature Instructions Continue**: Appears next to "Nature Practice" in the timeline
- **RA Wait Continue/Replay**: Appears in the block stages area under "RA Q&A"
- **Break Continue**: Appears next to "Break Time" below the block

### Additional Monitor Controls

| Button | Action | Available When |
|--------|--------|----------------|
| **Replay** | Replays audio instructions (sends R) | During RA Wait screens |
| **Skip Trial** | Skips current trial (sends Escape) | Always visible during session |
| **Pause Session** | Pauses after current trial | Always visible during session |
| **Pause Video** | Immediately pauses video playback | During video trials only |

## Detailed Screen Descriptions

### Setup Phase

#### Preload (`preload`)
- **What participant sees**: Loading screen while assets load
- **Advances with**: Automatic when all assets are loaded
- **Notes**: Preloads all videos, images, and audio files

#### PID Entry (`pid_entry`)
- **What participant sees**: Text input for 8-digit participant ID
- **Advances with**: **Enter** key after typing valid 8-digit ID
- **Validation**: Must be exactly 8 digits (A prefix removed automatically)
- **Notes**: PID stored and sent to monitor

#### PID Transition (`pid_transition`)
- **What participant sees**: Blank screen
- **Advances with**: Automatic after 100ms
- **Notes**: Brief transition to prevent double-submission

#### PID Confirmation (`pid_confirmation`)
- **What participant sees**: "Please confirm that this PID is correct: [PID]"
- **Advances with**: **Enter** to confirm, **N** to go back and re-enter
- **Notes**: Loops back to PID entry if N pressed

### Equipment Phase

#### Audio Test (`audio_test`)
- **What participant sees**: Audio player with test audio, "Continue" button
- **Advances with**: Click **Continue** button
- **Notes**: Participant adjusts volume before continuing

#### Dial Calibration (`dial_calibration`)
- **What participant sees**: Instructions to click the dial button
- **Advances with**: **N** or **R** key (physical dial click)
- **Notes**: Confirms dial button is working

#### Dial Test (`dial_test`)
- **What participant sees**: Interactive dial test screen showing current dial value
- **Advances with**: **M** key (RA only)
- **Notes**: Monitor has "Continue" button to send M

### Instructions Phase

#### Study Overview (`study_overview`)
- **What participant sees**: Overview of the study structure and what to expect
- **Advances with**: **N** or **R** key
- **Notes**: General study information

#### Dial Instructions (`dial_instructions`)
- **What participant sees**: Instructions on how to use the dial during videos
- **Advances with**: **N** or **R** key
- **Notes**: Explains arousal rating during video playback

### Nature Practice Phase

#### Nature Instructions (`nature_instructions`)
- **What participant sees**: Instructions about the practice nature video
- **Advances with**: **M** key (RA only)
- **Notes**: RA advances when participant is ready

#### Nature Video + Dial (`nature_video_dial`)
- **What participant sees**: Nature video with dial overlay for arousal rating
- **Advances with**: Automatic when video ends
- **Notes**: Practice video, dial values recorded

#### Rating Screens (Arousal, Pleasure, Distraction, Immersion)
- **What participant sees**: Vertical thermometer with question on left
- **Advances with**: **N** or **R** key (dial click)
- **Thermometer**: Starts at value 5, range 0-10
- **Notes**: Four ratings collected after each video

### Block Phase (x3 blocks)

Each block follows this structure:

#### Audio Intro (`audio_intro`)
- **What participant sees**: "Now playing audio instructions..."
- **Advances with**: Automatic after 3 seconds
- **Notes**: Brief intro before audio plays

#### Audio Play (`audio_play`)
- **What participant sees**: Audio instructions for the block type (participatory/observatory/neutral)
- **Advances with**: Automatic when audio ends, **R** to skip
- **Notes**: Explains the condition for this block

#### RA Wait (`ra_wait`)
- **What participant sees**: "Please wait for the research assistant"
- **Advances with**: **M** key (RA only), **R** to replay audio
- **Notes**: RA answers questions and advances when ready

#### Practice Intro (`practice_intro`)
- **What participant sees**: Introduction to the practice video for this block
- **Advances with**: **N** or **R** key
- **Notes**: Prepares participant for practice

#### Practice Video (`practice_video`)
- **What participant sees**: Practice video for this block type
- **Advances with**: Automatic when video ends
- **Notes**: One practice video per block

#### Practice Ratings (x4)
- **What participant sees**: Rating thermometers (arousal, pleasure, distraction, immersion)
- **Advances with**: **N** or **R** key
- **Notes**: Same as nature practice ratings

#### Condition Instructions (`condition_instructions`)
- **What participant sees**: Final reminder of the condition instructions
- **Advances with**: **R** key or automatic after 45 seconds
- **Notes**: Reinforces the block type (participatory/observatory/neutral)

#### Video + Dial (x6 videos) (`video_dial_rating`)
- **What participant sees**: Video with dial overlay for continuous arousal rating
- **Advances with**: Automatic when video ends
- **Notes**: Main experimental videos

#### Video Ratings (x4 per video) (`rating_*`)
- **What participant sees**: Vertical thermometer rating screens
- **Advances with**: **N** or **R** key
- **Notes**: Four ratings after each video

#### Break Slide (`break_slide`) - After blocks 1 and 2 only
- **What participant sees**: Break screen
- **Advances with**: **M** key (RA only)
- **Notes**: RA decides when break is over

### End Phase

#### End Screen (`end_screen`)
- **What participant sees**: "Thank you for participating" message
- **Advances with**: **N** or **R** key
- **Notes**: Data is saved to JATOS

## Block Types

There are three block types, presented in randomized order:

1. **Participatory** - Participant imagines being involved in the video
2. **Observatory** - Participant watches passively
3. **Neutral** - Control condition

Each block contains:
- Audio instructions specific to the condition
- 1 practice video
- 6 main experimental videos
- Ratings after each video

## Monitor Integration

The monitor dashboard tracks:
- Current stage and substage
- Block type and progress
- Live dial values during videos
- All ratings with response times
- Session timer

Monitor controls:
- **Continue** button for RA wait screens
- **Replay** button to replay audio
- **Skip Trial** button (sends Escape)
- **Pause Session** button
- **Pause Video** button (during video playback)

## Rating Thermometer

The vertical thermometer for ratings:
- **Position**: Question on left, thermometer on right
- **Range**: 0-10 with half-point increments
- **Start value**: 5 (center of scale)
- **Control**: Physical dial (scroll wheel) adjusts value
- **Submit**: Dial button click (sends Enter key)
- **Visual**: Fill height represents current value, indicator line at value position
