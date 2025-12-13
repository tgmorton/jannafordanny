# Video Arousal Rating Experiment

A jsPsych experiment for measuring arousal responses to video stimuli using continuous trackpad-based ratings.

## Prerequisites

### Install Node.js and npm

**macOS:**
```bash
# Using Homebrew
brew install node

# Or download from https://nodejs.org/
```

**Windows:**
Download and install from https://nodejs.org/ (LTS version recommended)

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm

# Or use nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install node
```

Verify installation:
```bash
node --version
npm --version
```

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd jannatest
```

2. Install dependencies:
```bash
npm install
```

3. Add video files:
   - Place 18 video files in the `assets/` folder
   - Files should be named: `ff1` through `ff9` and `fm1` through `fm9`
   - Supported formats: `.mov` (default) or `.mp4`
   - To switch formats, edit `src/experiment.js` to load `videos.json` (mp4) or `videos_mov.json` (mov)

## Running the Experiment

### Development mode (local testing):
```bash
npm start
```
This will open a browser at `http://localhost:3000/`

### Build for production:
```bash
npm run build
```
Output will be in `packaged/experiment_0.2.0.zip`

### Build for JATOS:
```bash
npm run jatos
```
Output will be in `packaged/experiment_0.2.0.jzip`

## Experiment Structure

1. **Welcome screen**
2. **Practice trial** - Learn the trackpad-based arousal rating system
3. **Main experiment** - 3 blocks (neutral, participatory, observatory) with 6 videos each
   - Block order is randomized per participant
   - Videos are randomly assigned to blocks
   - After each video: Likert scale arousal rating (0-10)
4. **End screen**

## Data Collected

- Continuous arousal ratings during practice (trackpad)
- Post-video arousal ratings (Likert scale)
- Video metadata (filename, type, block, trial number)
- Response times

## File Structure

```
jannatest/
├── src/
│   ├── experiment.js          # Main experiment code
│   └── plugins/               # Custom jsPsych plugins
├── styles/
│   └── main.scss              # Experiment styles
├── assets/
│   ├── videos.json            # Video metadata
│   └── *.mp4                  # Video files (not in git)
├── package.json
└── README.md
```

## Git Basics (for beginners)

Git is a version control system that tracks changes to your code. Here's how to use it:

### First-time setup
```bash
# Set your name and email (only need to do this once)
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Common commands

**Check status** - See what files have changed:
```bash
git status
```

**Stage changes** - Prepare files to be committed:
```bash
git add .                    # Add all changed files
git add filename.js          # Add a specific file
```

**Commit** - Save your changes with a message:
```bash
git commit -m "Describe what you changed"
```

**Push** - Upload your commits to the remote repository:
```bash
git push
```

**Pull** - Download the latest changes from the remote:
```bash
git pull
```

**View history** - See past commits:
```bash
git log --oneline
```

### Typical workflow

1. Make changes to your files
2. Check what changed: `git status`
3. Stage the changes: `git add .`
4. Commit with a message: `git commit -m "Added new feature"`
5. Push to remote: `git push`

### Cloning vs. downloading

- **Clone** (recommended): `git clone <url>` - Downloads the repo AND connects it to git
- **Download ZIP**: Just downloads files, no git connection

### Getting help
```bash
git help              # General help
git help commit       # Help for a specific command
```

## jsPsych Basics (Learning Guide)

This repository can be used as a learning resource for jsPsych. Here are the key concepts demonstrated:

### What is jsPsych?

jsPsych is a JavaScript library for running behavioral experiments in a web browser. It handles the flow of trials, collects responses, and records data automatically.

**Official documentation:** https://www.jspsych.org/

### Core Concepts

#### 1. Timeline
The timeline is an array of trials that run in sequence:
```javascript
const timeline = [];
timeline.push(trial1);
timeline.push(trial2);
await jsPsych.run(timeline);
```

#### 2. Trials
Each trial is an object with a `type` (plugin) and configuration options:
```javascript
var welcome = {
  type: HtmlKeyboardResponsePlugin,
  stimulus: "<h1>Welcome!</h1><p>Press any key to continue.</p>"
};
```

#### 3. Plugins
Plugins define trial types. Common plugins include:
- `HtmlKeyboardResponsePlugin` - Show HTML, wait for keypress
- `VideoKeyboardResponsePlugin` - Play video, wait for keypress
- `SurveyLikertPlugin` - Likert scale questions
- `PreloadPlugin` - Preload media files

Import plugins at the top of your experiment:
```javascript
import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
```

#### 4. Timeline Variables (for repeated trials)
When you want to repeat a trial with different stimuli:
```javascript
// Define the stimuli
var stimuli = [
  { filepath: ['assets/video1.mp4'], name: 'video1' },
  { filepath: ['assets/video2.mp4'], name: 'video2' }
];

// Define the trial template
var video_trial = {
  type: VideoKeyboardResponsePlugin,
  stimulus: jsPsych.timelineVariable('filepath'),  // References stimuli
  data: {
    filename: jsPsych.timelineVariable('name')
  }
};

// Create procedure that repeats the trial for each stimulus
var procedure = {
  timeline: [video_trial],
  timeline_variables: stimuli
};

timeline.push(procedure);
```

#### 5. Data Collection
jsPsych automatically collects data. Add custom data fields:
```javascript
var trial = {
  type: HtmlKeyboardResponsePlugin,
  stimulus: "Hello",
  data: {
    task: 'greeting',
    condition: 'friendly'
  }
};
```

#### 6. Randomization
Shuffle arrays using Fisher-Yates algorithm:
```javascript
function shuffle(array) {
  var shuffled = [...array];
  for (var i = shuffled.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

### Key Patterns in This Experiment

1. **Async data loading** - Load stimuli from JSON file
2. **Block design** - Multiple blocks with different conditions
3. **Nested timelines** - Trials within blocks within the main timeline
4. **Custom plugins** - VideoArousalRatingPlugin for specialized input
5. **CSS styling** - Custom styles in `styles/main.scss`

### Learning Resources

- **jsPsych Documentation:** https://www.jspsych.org/
- **jsPsych Tutorials:** https://www.jspsych.org/latest/tutorials/
- **Plugin List:** https://www.jspsych.org/latest/plugins/
- **jspsych-builder:** https://github.com/bjoluc/jspsych-builder

### Tips for Beginners

1. **Start simple** - Begin with basic trials before adding complexity
2. **Use console.log** - Debug by logging variables to browser console
3. **Check the browser console** - Press F12 to see errors
4. **Test incrementally** - Add features one at a time and test each
5. **Read plugin docs** - Each plugin has specific options

## Troubleshooting

**Videos not loading:**
- Ensure video files are in the `assets/` folder
- Check file names match the expected format (ff1.mov, fm1.mov, etc.)
- **Note on .mov files:** Safari has best support for .mov. Chrome/Firefox may have issues with some .mov files. If videos don't play, consider converting to .mp4 using: `ffmpeg -i input.mov -c:v libx264 -c:a aac output.mp4`

**npm install fails:**
- Try deleting `node_modules/` and `package-lock.json`, then run `npm install` again

**Experiment won't start:**
- Check browser console for errors (F12 or Cmd+Option+I)
- Ensure you're using Chrome or Firefox (Safari may have issues)
