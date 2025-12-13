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
   - Place 18 MP4 video files in the `assets/` folder
   - Files should be named: `ff1.mp4` through `ff9.mp4` and `fm1.mp4` through `fm9.mp4`

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
Output will be in `packaged/experiment_0.1.0.zip`

### Build for JATOS:
```bash
npm run jatos
```
Output will be in `packaged/experiment_0.1.0.jzip`

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

## Troubleshooting

**Videos not loading:**
- Ensure MP4 files are in the `assets/` folder
- Check file names match the expected format (ff1.mp4, fm1.mp4, etc.)

**npm install fails:**
- Try deleting `node_modules/` and `package-lock.json`, then run `npm install` again

**Experiment won't start:**
- Check browser console for errors (F12 or Cmd+Option+I)
- Ensure you're using Chrome or Firefox (Safari may have issues)
